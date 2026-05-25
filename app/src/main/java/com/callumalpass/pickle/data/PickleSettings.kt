package com.callumalpass.pickle.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class ConnectionSettings(
  val serverUrl: String = "http://10.0.2.2:8787",
  val token: String = "",
  val collection: String = "",
)

class PickleSettings(context: Context) {
  private val prefs: SharedPreferences =
    context.applicationContext.getSharedPreferences("pickle", Context.MODE_PRIVATE)

  private val flow = MutableStateFlow(load())
  val settings: StateFlow<ConnectionSettings> = flow

  fun load(): ConnectionSettings =
    ConnectionSettings(
      serverUrl = prefs.getString(KEY_SERVER_URL, "http://10.0.2.2:8787") ?: "http://10.0.2.2:8787",
      token = prefs.getString(KEY_TOKEN, "") ?: "",
      collection = prefs.getString(KEY_COLLECTION, "") ?: "",
    )

  fun save(settings: ConnectionSettings) {
    prefs
      .edit()
      .putString(KEY_SERVER_URL, normalizeServerUrl(settings.serverUrl))
      .putString(KEY_TOKEN, settings.token.trim())
      .putString(KEY_COLLECTION, settings.collection.trim())
      .apply()
    flow.value = load()
  }

  fun isPushEnabled(): Boolean = prefs.getBoolean(KEY_PUSH_ENABLED, false)

  fun setPushEnabled(enabled: Boolean) {
    prefs.edit().putBoolean(KEY_PUSH_ENABLED, enabled).apply()
  }

  fun lastEventId(): Long = prefs.getLong(KEY_LAST_EVENT_ID, 0L)

  fun setLastEventId(id: Long) {
    if (id > lastEventId()) {
      prefs.edit().putLong(KEY_LAST_EVENT_ID, id).apply()
    }
  }

  companion object {
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_TOKEN = "token"
    private const val KEY_COLLECTION = "collection"
    private const val KEY_PUSH_ENABLED = "push_enabled"
    private const val KEY_LAST_EVENT_ID = "last_event_id"
  }
}
