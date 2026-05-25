package com.callumalpass.pickle.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionUrlTest {
  @Test
  fun normalizeServerUrlAddsHttpAndTrimsSlash() {
    assertEquals("http://100.74.41.120:8787", normalizeServerUrl("100.74.41.120:8787/"))
    assertEquals("http://100.74.41.120:8787", normalizeServerUrl(" http://100.74.41.120:8787/ "))
  }

  @Test
  fun friendlyConnectionErrorKeepsSocketAddressCopyable() {
    val message = friendlyConnectionError(java.io.IOException("Failed to connect to /100.74.41.120:8787"))
    assertTrue(message.contains("100.74.41.120:8787"))
  }
}
