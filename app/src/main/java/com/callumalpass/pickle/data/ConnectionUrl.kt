package com.callumalpass.pickle.data

private const val DEFAULT_SERVER_URL = "http://10.0.2.2:8787"

fun normalizeServerUrl(raw: String): String {
  val trimmed = raw.trim().trimEnd('/')
  if (trimmed.isBlank()) return DEFAULT_SERVER_URL
  return if (trimmed.contains("://")) trimmed else "http://$trimmed"
}

fun friendlyConnectionError(error: Throwable): String {
  val message = error.message.orEmpty()
  return when {
    message.isBlank() -> "Could not connect to Pickle"
    message.contains("Failed to connect", ignoreCase = true) -> "Could not connect to Pickle server. $message"
    message.contains("Expected URL scheme", ignoreCase = true) -> "Server URL needs http:// or https://"
    else -> message
  }
}
