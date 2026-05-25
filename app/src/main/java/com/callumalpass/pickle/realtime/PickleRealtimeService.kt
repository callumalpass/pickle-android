package com.callumalpass.pickle.realtime

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.callumalpass.pickle.MainActivity
import com.callumalpass.pickle.R
import com.callumalpass.pickle.data.ConnectionSettings
import com.callumalpass.pickle.data.PickleApi
import com.callumalpass.pickle.data.PickleEvent
import com.callumalpass.pickle.data.PickleSettings
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

class PickleRealtimeService : Service() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val client = OkHttpClient()
  private val api = PickleApi(client)
  private val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
  }
  private val running = AtomicBoolean(false)
  private var job: Job? = null
  private var socket: WebSocket? = null
  private lateinit var settingsStore: PickleSettings

  override fun onCreate() {
    super.onCreate()
    settingsStore = PickleSettings(applicationContext)
    ensureChannels()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      settingsStore.setPushEnabled(false)
      stopSelf()
      return START_NOT_STICKY
    }
    settingsStore.setPushEnabled(true)
    startForeground(SERVICE_NOTIFICATION_ID, serviceNotification("Connecting"))
    if (running.compareAndSet(false, true)) {
      job = scope.launch { runLoop() }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running.set(false)
    socket?.cancel()
    scope.cancel()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private suspend fun runLoop() {
    var backoffMs = 1000L
    while (running.get()) {
      val closed = kotlinx.coroutines.CompletableDeferred<Unit>()
      val settings = settingsStore.load()
      socket =
        client.newWebSocket(
          api.streamRequest(settings),
          object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
              backoffMs = 1000L
              notifyService("Connected")
              scope.launch { catchUp(settings) }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
              handleMessage(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
              notifyService("Reconnecting")
              closed.complete(Unit)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
              notifyService("Disconnected")
              closed.complete(Unit)
            }
          },
        )
      closed.await()
      delay(backoffMs)
      backoffMs = (backoffMs * 2).coerceAtMost(30_000L)
    }
  }

  private fun handleMessage(text: String) {
    if (text.contains("stream.ready")) return
    val event = runCatching { json.decodeFromString<PickleEvent>(text) }.getOrNull() ?: return
    processEvent(event, notify = true)
  }

  private suspend fun catchUp(settings: ConnectionSettings) {
    val startingAfter = settingsStore.lastEventId()
    var after = startingAfter
    val shouldNotify = startingAfter > 0L
    repeat(MAX_CATCHUP_PAGES) {
      val events = runCatching { api.events(settings, after, CATCHUP_LIMIT) }.getOrElse { error ->
        notifyService("Catch-up failed: ${error.message ?: "events unavailable"}")
        return
      }
      if (events.isEmpty()) return
      for (event in events) {
        processEvent(event, notify = shouldNotify)
        after = maxOf(after, event.id)
      }
      if (events.size < CATCHUP_LIMIT) return
    }
  }

  private fun processEvent(event: PickleEvent, notify: Boolean) {
    if (event.id <= settingsStore.lastEventId()) return
    settingsStore.setLastEventId(event.id)
    if (notify && event.type == "request.created") {
      postRequestNotification(notificationTitle(event), notificationBody(event), event.requestId)
    }
  }

  private fun notificationTitle(event: PickleEvent): String {
    val payload = event.payload as? JsonObject
    val title = payload?.get("title")?.jsonPrimitive?.contentOrNull ?: "New Pickle request"
    val kind = payload?.get("kind")?.jsonPrimitive?.contentOrNull
    return if (kind == "message") "Pickle message: $title" else title
  }

  private fun notificationBody(event: PickleEvent): String {
    val payload = event.payload as? JsonObject
    val source = payload?.get("source")?.jsonPrimitive?.contentOrNull
    val kind = payload?.get("kind")?.jsonPrimitive?.contentOrNull
    return listOfNotNull(source, kind, event.requestId).joinToString(" / ").ifBlank { event.requestId ?: "Pending request" }
  }

  private fun notifyService(state: String) {
    val manager = getSystemService(NotificationManager::class.java)
    manager.notify(SERVICE_NOTIFICATION_ID, serviceNotification(state))
  }

  private fun serviceNotification(state: String) =
    NotificationCompat.Builder(this, CHANNEL_SERVICE)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Pickle push")
      .setContentText(state)
      .setOngoing(true)
      .setContentIntent(mainPendingIntent())
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

  private fun postRequestNotification(title: String, body: String, requestId: String?) {
    val manager = getSystemService(NotificationManager::class.java)
    val notification =
      NotificationCompat.Builder(this, CHANNEL_REQUESTS)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(title)
        .setContentText(body)
        .setContentIntent(mainPendingIntent(requestId))
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .build()
    manager.notify((requestId ?: System.currentTimeMillis().toString()).hashCode(), notification)
  }

  private fun mainPendingIntent(requestId: String? = null): PendingIntent {
    val intent =
      Intent(this, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val trimmedRequestId = requestId?.trim()?.takeIf { it.isNotBlank() }
    if (trimmedRequestId != null) {
      intent.putExtra(MainActivity.EXTRA_REQUEST_ID, trimmedRequestId)
    }
    return PendingIntent.getActivity(
      this,
      trimmedRequestId?.hashCode() ?: 0,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private fun ensureChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL_SERVICE, "Pickle connection", NotificationManager.IMPORTANCE_LOW))
    manager.createNotificationChannel(NotificationChannel(CHANNEL_REQUESTS, "Pickle requests", NotificationManager.IMPORTANCE_HIGH))
  }

  companion object {
    private const val ACTION_STOP = "com.callumalpass.pickle.STOP_REALTIME"
    private const val CHANNEL_SERVICE = "pickle_service"
    private const val CHANNEL_REQUESTS = "pickle_requests"
    private const val SERVICE_NOTIFICATION_ID = 101
    private const val CATCHUP_LIMIT = 100
    private const val MAX_CATCHUP_PAGES = 10

    fun start(context: Context) {
      val intent = Intent(context, PickleRealtimeService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, PickleRealtimeService::class.java))
    }
  }
}
