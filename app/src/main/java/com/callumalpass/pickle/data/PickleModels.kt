package com.callumalpass.pickle.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

@Serializable
data class PickleRequest(
  val id: String,
  val path: String = "",
  val source: String,
  val kind: String,
  val title: String,
  val message: String = "",
  val body: String = "",
  val status: String,
  val state: String = status,
  @SerialName("response_count") val responseCount: Int = 0,
  val priority: String = "normal",
  @SerialName("response_type") val responseType: String = "pickle_response_approval",
  val tags: List<String> = emptyList(),
  val links: List<PickleLink> = emptyList(),
  val attachments: List<PickleAttachment> = emptyList(),
  val metadata: JsonElement? = null,
  @SerialName("dedupe_key") val dedupeKey: String = "",
  @SerialName("created_at") val createdAt: String,
  @SerialName("updated_at") val updatedAt: String,
  @SerialName("answered_at") val answeredAt: String? = null,
  val response: PickleResponse? = null,
  @SerialName("response_type_definition") val responseTypeDefinition: TypeDefinition? = null,
)

@Serializable data class PickleLink(val label: String, val url: String? = null, val path: String? = null)

@Serializable
data class PickleAttachment(
  val id: String,
  @SerialName("request_id") val requestId: String? = null,
  val filename: String,
  @SerialName("content_type") val contentType: String,
  @SerialName("size_bytes") val sizeBytes: Long,
  val sha256: String,
  @SerialName("created_at") val createdAt: String,
)

@Serializable
data class PickleResponse(
  @SerialName("request_id") val requestId: String,
  val path: String = "",
  @SerialName("response_type") val responseType: String = "",
  val responder: String,
  val payload: JsonElement,
  @SerialName("created_at") val createdAt: String,
)

@Serializable data class InboxResponse(val requests: List<PickleRequest>)

@Serializable data class EventsResponse(val events: List<PickleEvent>)

@Serializable
data class PickleEvent(
  val id: Long,
  val type: String,
  @SerialName("request_id") val requestId: String? = null,
  val payload: JsonElement? = null,
  @SerialName("created_at") val createdAt: String,
)

@Serializable data class SubmitResponseRequest(val responder: String, val payload: JsonElement)

@Serializable
data class CreateRequestPayload(
  val source: String,
  val kind: String,
  val title: String,
  val message: String = "",
  val body: String = "",
  @SerialName("response_type") val responseType: String = "",
  val priority: String = "normal",
  val tags: List<String> = emptyList(),
  val links: List<PickleLink> = emptyList(),
  val metadata: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class TypeDefinition(
  val name: String,
  val kind: String? = null,
  val version: Int? = null,
  val description: String? = null,
  @SerialName("display_name_key") val displayNameKey: String? = null,
  val fields: Map<String, MdbaseFieldDefinition> = emptyMap(),
  val schema: JsonObject? = null,
  val collection: JsonObject? = null,
  val lifecycle: JsonObject? = null,
)

@Serializable
data class MdbaseFieldDefinition(
  @SerialName("type") val fieldType: String = "string",
  val required: Boolean = false,
  val description: String? = null,
  val default: JsonElement? = null,
  val generated: JsonElement? = null,
  val values: List<String> = emptyList(),
  val items: MdbaseFieldDefinition? = null,
  val fields: Map<String, MdbaseFieldDefinition> = emptyMap(),
  val target: String? = null,
  @SerialName("validate_exists") val validateExists: Boolean? = null,
)
