package com.callumalpass.pickle.data

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CreateRequestPayloadTest {
  @Test
  fun messagePayloadIncludesExplicitSourceAndKind() {
    val encoded =
      Json.encodeToString(
        CreateRequestPayload(
          source = "callum",
          kind = "message",
          title = "hello",
          message = "hello agents",
          responseType = "pickle_response_ack",
          tags = listOf("ops"),
        ),
      )

    assertTrue(encoded.contains(""""source":"callum""""))
    assertTrue(encoded.contains(""""kind":"message""""))
    assertTrue(encoded.contains(""""message":"hello agents""""))
    assertTrue(encoded.contains(""""response_type":"pickle_response_ack""""))
    assertTrue(encoded.contains(""""tags":["ops"]"""))
  }

  @Test
  fun dismissMessagePayloadUsesAckResponseShape() {
    val payload = dismissMessagePayload() as JsonObject
    assertEquals("Acknowledged", payload["message"]?.jsonPrimitive?.contentOrNull)
  }
}
