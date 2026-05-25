package com.callumalpass.pickle.data

import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class PickleApi(private val client: OkHttpClient = OkHttpClient()) {
  private val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
  }

  suspend fun health(settings: ConnectionSettings): Boolean =
    withContext(Dispatchers.IO) {
      val request = Request.Builder().url(baseUrl(settings) + "/health").get().build()
      client.newCall(request).execute().use { response -> response.isSuccessful }
    }

  suspend fun inbox(settings: ConnectionSettings, status: String = "pending"): List<PickleRequest> =
    withContext(Dispatchers.IO) {
      val request =
        authed(settings, baseUrl(settings) + "/api/v1/inbox?status=$status")
          .get()
          .build()
      client.newCall(request).execute().use { response ->
        if (!response.isSuccessful) throw IOException("Inbox failed: HTTP ${response.code}")
        json.decodeFromString<InboxResponse>(response.body.string()).requests
      }
    }

  suspend fun events(settings: ConnectionSettings, after: Long, limit: Int = 100): List<PickleEvent> =
    withContext(Dispatchers.IO) {
      val request =
        authed(settings, baseUrl(settings) + "/api/v1/events?after=$after&limit=$limit")
          .get()
          .build()
      client.newCall(request).execute().use { response ->
        if (!response.isSuccessful) throw IOException("Events failed: HTTP ${response.code}")
        json.decodeFromString<EventsResponse>(response.body.string()).events
      }
    }

  suspend fun request(settings: ConnectionSettings, id: String): PickleRequest =
    withContext(Dispatchers.IO) {
      val request = authed(settings, baseUrl(settings) + "/api/v1/requests/$id").get().build()
      client.newCall(request).execute().use { response ->
        if (!response.isSuccessful) throw IOException("Request failed: HTTP ${response.code}")
        json.decodeFromString<PickleRequest>(response.body.string())
      }
    }

  suspend fun attachment(settings: ConnectionSettings, requestId: String, attachmentId: String): ByteArray =
    withContext(Dispatchers.IO) {
      val request =
        authed(settings, baseUrl(settings) + "/api/v1/requests/$requestId/attachments/$attachmentId")
          .get()
          .build()
      client.newCall(request).execute().use { response ->
        if (!response.isSuccessful) throw IOException("Attachment failed: HTTP ${response.code}")
        response.body.bytes()
      }
    }

  suspend fun createRequest(settings: ConnectionSettings, body: CreateRequestPayload): PickleRequest =
    withContext(Dispatchers.IO) {
      val requestBody = json.encodeToString(body).toRequestBody("application/json".toMediaType())
      val request =
        authed(settings, baseUrl(settings) + "/api/v1/requests")
          .post(requestBody)
          .build()
      client.newCall(request).execute().use { response ->
        if (!response.isSuccessful) throw IOException("Message failed: HTTP ${response.code}: ${response.body.string()}")
        json.decodeFromString<PickleRequest>(response.body.string())
      }
    }

  suspend fun respond(settings: ConnectionSettings, id: String, body: SubmitResponseRequest): PickleRequest =
    withContext(Dispatchers.IO) {
      val requestBody = json.encodeToString(body).toRequestBody("application/json".toMediaType())
      val request =
        authed(settings, baseUrl(settings) + "/api/v1/requests/$id/responses")
          .post(requestBody)
          .build()
      client.newCall(request).execute().use { response ->
        if (!response.isSuccessful) throw IOException("Response failed: HTTP ${response.code}: ${response.body.string()}")
        json.decodeFromString<PickleRequest>(response.body.string())
      }
    }

  fun streamRequest(settings: ConnectionSettings): Request {
    val url =
      settings.serverUrl
        .let(::normalizeServerUrl)
        .replaceFirst("https://", "wss://")
        .replaceFirst("http://", "ws://") + "/api/v1/stream"
    return authed(settings, url).build()
  }

  private fun baseUrl(settings: ConnectionSettings): String = normalizeServerUrl(settings.serverUrl)

  private fun authed(settings: ConnectionSettings, url: String): Request.Builder {
    val builder = Request.Builder().url(url)
    if (settings.token.isNotBlank()) builder.header("Authorization", "Bearer ${settings.token}")
    if (settings.collection.isNotBlank()) builder.header("X-Pickle-Collection", settings.collection)
    return builder
  }
}
