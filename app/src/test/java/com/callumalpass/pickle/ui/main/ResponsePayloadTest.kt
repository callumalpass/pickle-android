package com.callumalpass.pickle.ui.main

import com.callumalpass.pickle.data.MdbaseFieldDefinition
import com.callumalpass.pickle.data.PickleRequest
import com.callumalpass.pickle.data.TypeDefinition
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
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
  fun v03JsonSchemaTypesProduceTheSameEditableResponseContract() {
    val typeDefinition =
      Json.decodeFromString<TypeDefinition>(
        """
        {
          "kind": "mdbase.type",
          "name": "pickle_response_approval",
          "version": 1,
          "schema": {
            "dialect": "json-schema-2020-12",
            "value": {
              "type": "object",
              "required": ["request", "decision"],
              "properties": {
                "type": { "const": "pickle_response_approval" },
                "id": { "type": "string" },
                "request": { "type": "string" },
                "decision": { "enum": ["approve", "reject", "revise"] },
                "comment": { "type": "string" },
                "responded_at": { "type": "string", "format": "date-time" }
              }
            }
          },
          "collection": {
            "links": {
              "request": { "target_type": "pickle_request", "validate_exists": true }
            }
          },
          "lifecycle": {
            "on_create": {
              "set": {
                "id": { "ulid": true },
                "responded_at": { "now": true }
              }
            }
          }
        }
        """.trimIndent(),
      )

    val fields = editableResponseFields(typeDefinition)

    assertEquals(listOf("decision", "comment"), fields.map { it.name })
    assertTrue(fields.first().definition.required)
    assertEquals(listOf("approve", "reject", "revise"), fields.first().definition.values)
    assertEquals(
      Json.parseToJsonElement("""{"decision":"approve","comment":"Looks right."}"""),
      buildPayload(typeDefinition, mapOf("decision" to "approve", "comment" to "Looks right.")),
    )
  }

  @Test
  fun initialValuesComeFromRequestMetadataForEditableFieldsOnly() {
    val request =
      PickleRequest(
        id = "req-closeout",
        source = "tasknotes-ops",
        kind = "approval",
        title = "Close TaskNotes #518",
        status = "pending",
        createdAt = "2026-05-29T00:00:00Z",
        updatedAt = "2026-05-29T00:00:00Z",
        metadata =
          buildJsonObject {
            put("workflow", "tasknotes-ops")
            put("draft_issue_comment", "Edited draft starts here.")
            put("close_reason", "completed")
          },
      )

    assertEquals(
      mapOf("draft_issue_comment" to "Edited draft starts here.", "close_reason" to "completed"),
      initialResponseValues(request, editableResponseFields(tasknotesCloseoutTypeDefinition())),
    )
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

  private fun tasknotesCloseoutTypeDefinition(): TypeDefinition =
    TypeDefinition(
      name = "tasknotes_closeout_response",
      fields =
        linkedMapOf(
          "request" to MdbaseFieldDefinition(fieldType = "link", target = "pickle_request", required = true),
          "decision" to
            MdbaseFieldDefinition(
              fieldType = "enum",
              values = listOf("approve", "reject", "revise", "snooze"),
              required = true,
            ),
          "draft_issue_comment" to MdbaseFieldDefinition(fieldType = "string", required = true),
          "close_reason" to MdbaseFieldDefinition(fieldType = "enum", values = listOf("completed", "not_planned"), required = true),
          "snooze_until" to MdbaseFieldDefinition(fieldType = "string"),
          "comment" to MdbaseFieldDefinition(fieldType = "string"),
          "responded_at" to MdbaseFieldDefinition(fieldType = "datetime", generated = JsonPrimitive("now")),
        ),
    )
}
