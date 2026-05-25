package com.callumalpass.pickle.ui.main

import com.callumalpass.pickle.data.MdbaseFieldDefinition
import com.callumalpass.pickle.data.TypeDefinition
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ResponsePayloadTest {
  @Test
  fun buildPayloadKeepsDecisionAndCommentShape() {
    val payload = buildPayload(sampleApprovalTypeDefinition(), mapOf("decision" to "approve", "comment" to "Looks right."))
    val obj = payload as JsonObject
    assertEquals("approve", obj["decision"]?.toString()?.trim('"'))
    assertEquals("""{"decision":"approve","comment":"Looks right."}""", Json.encodeToString(JsonObject.serializer(), obj))
  }

  @Test
  fun buildPayloadKeepsListSelectionsAsJsonArrays() {
    val payload =
      buildPayload(
        listApprovalTypeDefinition(),
        mapOf("decision" to "approve", "approved_items" to """["issue-1","issue-3"]"""),
      ) as JsonObject

    assertEquals("""["issue-1","issue-3"]""", payload["approved_items"].toString())
  }

  @Test
  fun validateDraftRejectsInvalidListBeforeSubmit() {
    val empty = validateResponseDraft(listApprovalTypeDefinition(), mapOf("decision" to "approve"))
    assertEquals("Select at least one item", empty.errors["approved_items"])

    val invalid =
      validateResponseDraft(
        listApprovalTypeDefinition(),
        mapOf("decision" to "approve", "approved_items" to """["issue-4"]"""),
      )
    assertTrue(invalid.errors["approved_items"].orEmpty().contains("not allowed"))
  }

  @Test
  fun editableFieldsSkipMdbaseSystemFields() {
    assertEquals(listOf("decision", "comment"), editableResponseFields(sampleApprovalTypeDefinition()).map { it.name })
  }

  @Test
  fun parseTagsNormalizesHashesAndDuplicates() {
    assertEquals(listOf("ops", "urgent", "review"), parseTagInput("#ops, urgent ops\nreview"))
  }

  private fun listApprovalTypeDefinition(): TypeDefinition =
    TypeDefinition(
      name = "pickle_response_approval",
      fields =
        linkedMapOf(
          "request" to MdbaseFieldDefinition(fieldType = "link", target = "pickle_request", required = true),
          "decision" to MdbaseFieldDefinition(fieldType = "enum", values = listOf("approve", "reject"), required = true),
          "approved_items" to
            MdbaseFieldDefinition(
              fieldType = "list",
              required = true,
              items = MdbaseFieldDefinition(fieldType = "enum", values = listOf("issue-1", "issue-2", "issue-3")),
            ),
          "comment" to MdbaseFieldDefinition(fieldType = "string"),
          "responded_at" to MdbaseFieldDefinition(fieldType = "datetime"),
        ),
    )
}
