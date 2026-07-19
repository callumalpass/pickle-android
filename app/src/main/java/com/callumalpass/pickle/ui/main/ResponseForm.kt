package com.callumalpass.pickle.ui.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.callumalpass.pickle.data.MdbaseFieldDefinition
import com.callumalpass.pickle.data.PickleRequest
import com.callumalpass.pickle.data.TypeDefinition
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

private val responseJson = Json { ignoreUnknownKeys = true }
private val systemResponseFields =
  setOf("type", "types", "id", "request", "responded_at", "responder", "attachment_paths")

@Composable
internal fun ResponseForm(
  request: PickleRequest,
  sending: Boolean,
  onRespond: (PickleRequest, JsonElement) -> Unit,
) {
  val typeDefinition = request.responseTypeDefinition ?: sampleApprovalTypeDefinition()
  val fields = editableResponseFields(typeDefinition)
  val values =
    remember(request.id, request.metadata, typeDefinition) {
      mutableStateMapOf<String, String>().apply {
        putAll(initialResponseValues(request, fields))
      }
    }
  var fieldErrors by remember(request.id) { mutableStateOf<Map<String, String>>(emptyMap()) }

  fun updateValue(name: String, value: String) {
    values[name] = value
    if (fieldErrors.containsKey(name)) {
      fieldErrors = fieldErrors - name
    }
  }

  fun submit(overrides: Map<String, String> = emptyMap()) {
    overrides.forEach { (name, value) -> values[name] = value }
    val draft = values.toMap() + overrides
    val result = validateResponseDraft(typeDefinition, draft)
    if (result.errors.isNotEmpty()) {
      fieldErrors = result.errors
      return
    }
    fieldErrors = emptyMap()
    onRespond(request, result.payload)
  }

  Surface(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(8.dp),
    color = MaterialTheme.colorScheme.surface,
    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
  ) {
    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Text("Response", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
      fields.forEach { field ->
        FieldEditor(
          name = field.name,
          field = field.definition,
          value = values[field.name].orEmpty(),
          error = fieldErrors[field.name],
          enabled = !sending,
          onValueChange = { updateValue(field.name, it) },
        )
      }
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(
          onClick = { submit() },
          enabled = !sending,
          shape = RoundedCornerShape(7.dp),
        ) {
          Text(if (sending) "Sending" else "Submit")
        }
        if (fields.any { it.name == "decision" }) {
          OutlinedButton(
            onClick = { submit(mapOf("decision" to "reject")) },
            enabled = !sending,
            shape = RoundedCornerShape(7.dp),
          ) {
            Text("Reject")
          }
        }
      }
    }
  }
}

@Composable
private fun FieldEditor(
  name: String,
  field: MdbaseFieldDefinition,
  value: String,
  error: String?,
  enabled: Boolean,
  onValueChange: (String) -> Unit,
) {
  val enumValues = field.enumDisplayValues()
  val type = field.normalizedType()
  Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
    when {
      type == "list" -> ArrayFieldEditor(name, field, value, error, enabled, onValueChange)
      enumValues.isNotEmpty() -> EnumFieldEditor(name, enumValues, field.required, value, error, enabled, onValueChange)
      type == "boolean" -> BooleanFieldEditor(name, field.required, value, error, enabled, onValueChange)
      else -> TextFieldEditor(name, field, value, error, enabled, onValueChange)
    }
  }
}

@Composable
private fun EnumFieldEditor(
  name: String,
  enumValues: List<String>,
  required: Boolean,
  value: String,
  error: String?,
  enabled: Boolean,
  onValueChange: (String) -> Unit,
) {
  FieldLabel(name, required)
  FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    enumValues.forEach { option ->
      FilterChip(
        selected = value == option,
        enabled = enabled,
        onClick = { onValueChange(option) },
        label = { Text(option) },
      )
    }
  }
  ValidationMessage(error)
}

@Composable
private fun BooleanFieldEditor(
  name: String,
  required: Boolean,
  value: String,
  error: String?,
  enabled: Boolean,
  onValueChange: (String) -> Unit,
) {
  FieldLabel(name, required)
  Row(verticalAlignment = Alignment.CenterVertically) {
    Checkbox(
      checked = value.toBoolean(),
      enabled = enabled,
      onCheckedChange = { onValueChange(it.toString()) },
    )
    Text(if (value.toBoolean()) "Yes" else "No")
  }
  ValidationMessage(error)
}

@Composable
private fun TextFieldEditor(
  name: String,
  field: MdbaseFieldDefinition,
  value: String,
  error: String?,
  enabled: Boolean,
  onValueChange: (String) -> Unit,
) {
  val type = field.normalizedType()
  FieldLabel(name, field.required)
  OutlinedTextField(
    value = value,
    onValueChange = onValueChange,
    enabled = enabled,
    isError = error != null,
    singleLine = false,
    minLines = if (name.contains("comment", ignoreCase = true) || type == "object") 3 else 1,
    keyboardOptions =
      KeyboardOptions(
        keyboardType =
          when (type) {
            "integer", "number" -> KeyboardType.Number
            else -> KeyboardType.Text
          },
      ),
    modifier = Modifier.fillMaxWidth(),
  )
  ValidationMessage(error)
}

@Composable
private fun ArrayFieldEditor(
  name: String,
  field: MdbaseFieldDefinition,
  value: String,
  error: String?,
  enabled: Boolean,
  onValueChange: (String) -> Unit,
) {
  val itemField = field.items ?: MdbaseFieldDefinition()
  val enumValues = itemField.enumDisplayValues()
  val selected = arrayStringValues(value).filter { it.isNotBlank() }

  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      FieldLabel(name, field.required)
      SelectionCount(selected.size, field.required)
    }
    Surface(
      modifier = Modifier.fillMaxWidth(),
      shape = RoundedCornerShape(8.dp),
      color = MaterialTheme.colorScheme.surfaceVariant,
      border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
      Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (enumValues.isNotEmpty()) {
          ArrayEnumEditor(enumValues, selected, enabled, onValueChange)
        } else if (itemField.normalizedType("string") in setOf("string", "enum", "integer", "number")) {
          ArrayPrimitiveEditor(itemField, value, enabled, onValueChange)
        } else {
          OutlinedTextField(
            value = value.ifBlank { "[]" },
            onValueChange = onValueChange,
            enabled = enabled,
            isError = error != null,
            minLines = 4,
            modifier = Modifier.fillMaxWidth(),
          )
        }
      }
    }
    ValidationMessage(error)
  }
}

@Composable
private fun ArrayEnumEditor(
  enumValues: List<String>,
  selected: List<String>,
  enabled: Boolean,
  onValueChange: (String) -> Unit,
) {
  FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    enumValues.forEach { option ->
      val isSelected = selected.contains(option)
      FilterChip(
        selected = isSelected,
        enabled = enabled,
        onClick = {
          val next =
            if (isSelected) selected.filterNot { it == option }
            else selected + option
          onValueChange(encodeStringArray(next))
        },
        label = { Text(option) },
      )
    }
  }
  Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    TextButton(
      onClick = { onValueChange(encodeStringArray(enumValues)) },
      enabled = enabled && selected.size < enumValues.size,
    ) {
      Text("All")
    }
    TextButton(
      onClick = { onValueChange(encodeStringArray(emptyList())) },
      enabled = enabled && selected.isNotEmpty(),
    ) {
      Text("Clear")
    }
  }
}

@Composable
private fun ArrayPrimitiveEditor(
  itemField: MdbaseFieldDefinition,
  value: String,
  enabled: Boolean,
  onValueChange: (String) -> Unit,
) {
  val itemType = itemField.normalizedType("string")
  val rows = arrayStringValues(value).ifEmpty { listOf("") }
  rows.forEachIndexed { index, item ->
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
      OutlinedTextField(
        value = item,
        onValueChange = { onValueChange(updateArrayItem(value, index, it)) },
        enabled = enabled,
        singleLine = true,
        keyboardOptions =
          KeyboardOptions(
            keyboardType =
              when (itemType) {
                "integer", "number" -> KeyboardType.Number
                else -> KeyboardType.Text
              },
          ),
        modifier = Modifier.weight(1f),
      )
      IconButton(
        onClick = { onValueChange(removeArrayItem(value, index)) },
        enabled = enabled && (rows.size > 1 || item.isNotBlank()),
      ) {
        Icon(Icons.Rounded.Close, contentDescription = "Remove item")
      }
    }
  }
  OutlinedButton(
    onClick = { onValueChange(encodeStringArray(arrayStringValues(value) + "")) },
    enabled = enabled,
    shape = RoundedCornerShape(7.dp),
  ) {
    Icon(Icons.Rounded.Add, contentDescription = null)
    Text("Item", modifier = Modifier.padding(start = 8.dp))
  }
}

@Composable
private fun FieldLabel(name: String, required: Boolean) {
  Text(if (required) "$name *" else name, style = MaterialTheme.typography.labelLarge)
}

@Composable
private fun SelectionCount(count: Int, required: Boolean) {
  val text = if (required) "$count/1" else "$count selected"
  Surface(
    shape = RoundedCornerShape(999.dp),
    color = MaterialTheme.colorScheme.primaryContainer,
  ) {
    Text(
      text,
      modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
      style = MaterialTheme.typography.labelSmall,
      color = MaterialTheme.colorScheme.onPrimaryContainer,
    )
  }
}

@Composable
private fun ValidationMessage(error: String?) {
  if (error.isNullOrBlank()) return
  Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
    Icon(
      Icons.Rounded.ErrorOutline,
      contentDescription = null,
      modifier = Modifier.size(16.dp),
      tint = MaterialTheme.colorScheme.tertiary,
    )
    Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
  }
}

internal data class DraftValidationResult(
  val payload: JsonElement,
  val errors: Map<String, String>,
)

internal data class ResponseField(
  val name: String,
  val definition: MdbaseFieldDefinition,
)

internal fun editableResponseFields(typeDefinition: TypeDefinition): List<ResponseField> {
  val fields =
    typeDefinition.responseFieldDefinitions()
      .filterKeys { it !in systemResponseFields }
      .filterValues { it.generated == null }
      .map { (name, definition) -> ResponseField(name, definition) }
  return fields.ifEmpty { editableResponseFields(sampleApprovalTypeDefinition()) }
}

private fun TypeDefinition.responseFieldDefinitions(): Map<String, MdbaseFieldDefinition> {
  if (fields.isNotEmpty()) return fields

  val rootSchema = schema?.get("value") as? JsonObject ?: return emptyMap()
  val properties = rootSchema["properties"] as? JsonObject ?: return emptyMap()
  val required =
    (rootSchema["required"] as? JsonArray)
      ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
      ?.toSet()
      .orEmpty()
  val links = collection?.get("links") as? JsonObject ?: JsonObject(emptyMap())
  val generated = lifecycleGeneratedFields(lifecycle)

  return properties.mapValues { (name, definition) ->
    jsonSchemaField(
      definition = definition as? JsonObject ?: JsonObject(emptyMap()),
      required = name in required,
      link = links[name] as? JsonObject,
      generated = generated[name],
    )
  }
}

private fun jsonSchemaField(
  definition: JsonObject,
  required: Boolean,
  link: JsonObject?,
  generated: JsonElement?,
): MdbaseFieldDefinition {
  val rawType = (definition["type"] as? JsonPrimitive)?.contentOrNull.orEmpty()
  val format = (definition["format"] as? JsonPrimitive)?.contentOrNull
  val enumValues =
    (definition["enum"] as? JsonArray)
      ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
      .orEmpty()
  val fieldType =
    when {
      link != null -> "link"
      enumValues.isNotEmpty() -> "enum"
      rawType == "array" -> "list"
      rawType == "object" -> "object"
      rawType == "string" && format == "date-time" -> "datetime"
      rawType.isNotEmpty() -> rawType
      else -> "string"
    }
  val nestedRequired =
    (definition["required"] as? JsonArray)
      ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
      ?.toSet()
      .orEmpty()
  val nestedProperties = definition["properties"] as? JsonObject

  return MdbaseFieldDefinition(
    fieldType = fieldType,
    required = required,
    description = (definition["description"] as? JsonPrimitive)?.contentOrNull,
    default = definition["default"],
    generated = generated,
    values = enumValues,
    items =
      (definition["items"] as? JsonObject)?.let {
        jsonSchemaField(it, required = false, link = null, generated = null)
      },
    fields =
      nestedProperties
        ?.mapValues { (name, child) ->
          jsonSchemaField(
            definition = child as? JsonObject ?: JsonObject(emptyMap()),
            required = name in nestedRequired,
            link = null,
            generated = null,
          )
        }
        .orEmpty(),
    target = (link?.get("target_type") as? JsonPrimitive)?.contentOrNull,
    validateExists = (link?.get("validate_exists") as? JsonPrimitive)?.booleanOrNull,
  )
}

private fun lifecycleGeneratedFields(lifecycle: JsonObject?): Map<String, JsonElement> {
  if (lifecycle == null) return emptyMap()
  val generated = linkedMapOf<String, JsonElement>()

  listOf("on_create", "on_update").forEach { eventName ->
    val event = lifecycle[eventName]
    val actions =
      when (event) {
        is JsonObject -> listOf(event)
        is JsonArray -> event.mapNotNull { it as? JsonObject }
        else -> emptyList()
      }
    actions.forEach { action ->
      val set = action["set"] as? JsonObject ?: return@forEach
      set.forEach { (field, value) -> generated.putIfAbsent(field, value) }
    }
  }

  return generated
}

internal fun initialResponseValues(request: PickleRequest, fields: List<ResponseField>): Map<String, String> {
  val metadata = request.metadata as? JsonObject ?: return emptyMap()
  return fields
    .mapNotNull { field ->
      val value = metadata[field.name] ?: return@mapNotNull null
      val encoded = responseInitialValue(value)
      if (encoded.isEmpty()) null else field.name to encoded
    }
    .toMap()
}

private fun responseInitialValue(value: JsonElement): String =
  when (value) {
    is JsonPrimitive -> value.contentOrNull.orEmpty()
    is JsonArray,
    is JsonObject -> value.toString()
  }

internal fun validateResponseDraft(typeDefinition: TypeDefinition, values: Map<String, String>): DraftValidationResult {
  val fields = editableResponseFields(typeDefinition)
  val errors = linkedMapOf<String, String>()
  fields.forEach { field ->
    validateField(field.name, field.definition, values[field.name].orEmpty())?.let { errors[field.name] = it }
  }
  if (errors.isNotEmpty()) {
    return DraftValidationResult(JsonObject(emptyMap()), errors)
  }
  return DraftValidationResult(buildPayload(typeDefinition, values), emptyMap())
}

internal fun buildPayload(typeDefinition: TypeDefinition, values: Map<String, String>): JsonElement {
  val fields = editableResponseFields(typeDefinition)
  return buildJsonObject {
    fields.forEach { field ->
      val type = field.definition.normalizedType()
      val value = values[field.name].orEmpty()
      if (!field.definition.required && !hasValueForField(field.definition, value)) return@forEach
      when (type) {
        "boolean" -> put(field.name, JsonPrimitive(value.toBooleanStrictOrNull() ?: false))
        "integer" -> put(field.name, JsonPrimitive(value.toLongOrNull() ?: 0L))
        "number" -> put(field.name, JsonPrimitive(value.toDoubleOrNull() ?: 0.0))
        "list" -> put(field.name, buildArrayPayload(field.definition, value))
        "object" -> put(field.name, parseObjectValue(value) ?: JsonObject(emptyMap()))
        else -> put(field.name, JsonPrimitive(value))
      }
    }
  }
}

internal fun sampleApprovalTypeDefinition(): TypeDefinition =
  TypeDefinition(
    name = "pickle_response_approval",
    fields =
      linkedMapOf(
        "request" to MdbaseFieldDefinition(fieldType = "link", target = "pickle_request", required = true),
        "decision" to MdbaseFieldDefinition(fieldType = "enum", values = listOf("approve", "reject", "revise"), required = true),
        "comment" to MdbaseFieldDefinition(fieldType = "string"),
        "responded_at" to MdbaseFieldDefinition(fieldType = "datetime", generated = JsonPrimitive("now")),
        "responder" to MdbaseFieldDefinition(fieldType = "string"),
      ),
  )

private fun validateField(name: String, field: MdbaseFieldDefinition, value: String): String? {
  val type = field.normalizedType()
  if (field.required && type !in setOf("list", "boolean") && value.isBlank()) {
    return if (type == "list") "Add at least one item" else "Required"
  }
  if (!field.required && value.isBlank()) return null
  return when (type) {
    "integer" -> if (value.toLongOrNull() == null) "Enter a whole number" else null
    "number" -> if (value.toDoubleOrNull() == null) "Enter a number" else null
    "list" -> validateArrayField(field, value)
    "object" -> if (parseObjectValue(value) == null) "Enter a JSON object" else null
    else -> validateStringField(field, value)
  }
}

private fun validateStringField(field: MdbaseFieldDefinition, value: String): String? {
  val allowed = field.enumDisplayValues()
  if (allowed.isNotEmpty() && !allowed.contains(value)) {
    return "Choose an allowed value"
  }
  return null
}

private fun validateArrayField(field: MdbaseFieldDefinition, value: String): String? {
  val array = parseArrayValue(value) ?: return "Enter a JSON array"
  val payload = buildArrayPayload(field, value)
  if (field.required && payload.isEmpty()) {
    return "Select at least one item"
  }
  val itemField = field.items ?: MdbaseFieldDefinition()
  payload.forEachIndexed { index, item ->
    validateJsonValue("Item ${index + 1}", itemField, item)?.let { return it }
  }
  return if (array.size == payload.size) null else null
}

private fun validateJsonValue(label: String, field: MdbaseFieldDefinition, value: JsonElement): String? {
  val type = field.normalizedType("")
  if (type.isNotBlank() && !matchesJsonType(value, type)) {
    return "$label must be ${type.article()} $type"
  }
  val allowed = field.enumDisplayValues()
  if (allowed.isNotEmpty() && value !in allowed.map { JsonPrimitive(it) }) {
    return "$label is not allowed"
  }
  return null
}

private fun matchesJsonType(value: JsonElement, type: String): Boolean =
  when (type) {
    "string", "enum", "link", "datetime" -> (value as? JsonPrimitive)?.isString == true
    "boolean" -> (value as? JsonPrimitive)?.booleanOrNull != null
    "number" -> (value as? JsonPrimitive)?.doubleOrNull != null
    "integer" -> (value as? JsonPrimitive)?.longOrNull != null
    "object" -> value is JsonObject
    "list" -> value is JsonArray
    else -> true
  }

private fun buildArrayPayload(field: MdbaseFieldDefinition, value: String): JsonArray {
  val itemField = field.items ?: MdbaseFieldDefinition()
  val itemType = itemField.normalizedType("string")
  val items = parseArrayValue(value) ?: JsonArray(emptyList())
  return JsonArray(
    items.mapNotNull { item ->
      val content = (item as? JsonPrimitive)?.contentOrNull
      if (itemType in setOf("string", "enum", "integer", "number") && content.isNullOrBlank()) {
        null
      } else {
        coerceArrayItem(item, itemType)
      }
    },
  )
}

private fun coerceArrayItem(item: JsonElement, itemType: String): JsonElement {
  val content = (item as? JsonPrimitive)?.contentOrNull
  return when (itemType) {
    "boolean" -> JsonPrimitive(content?.toBooleanStrictOrNull() ?: (item as? JsonPrimitive)?.booleanOrNull ?: false)
    "integer" -> JsonPrimitive(content?.toLongOrNull() ?: (item as? JsonPrimitive)?.longOrNull ?: 0L)
    "number" -> JsonPrimitive(content?.toDoubleOrNull() ?: (item as? JsonPrimitive)?.doubleOrNull ?: 0.0)
    "object" -> item as? JsonObject ?: parseObjectValue(content.orEmpty()) ?: JsonObject(emptyMap())
    "list" -> item as? JsonArray ?: parseArrayValue(content.orEmpty()) ?: JsonArray(emptyList())
    else -> JsonPrimitive(content.orEmpty())
  }
}

private fun hasValueForField(field: MdbaseFieldDefinition, value: String): Boolean =
  when (field.normalizedType()) {
    "boolean" -> value.isNotBlank()
    "list" -> buildArrayPayload(field, value).isNotEmpty()
    else -> value.isNotBlank()
  }

private fun MdbaseFieldDefinition.normalizedType(default: String = "string"): String =
  when (val type = fieldType.ifBlank { default }.lowercase()) {
    "array" -> "list"
    "bool" -> "boolean"
    else -> type
  }

private fun MdbaseFieldDefinition.enumDisplayValues(): List<String> =
  values.takeIf { it.isNotEmpty() }.orEmpty()

private fun parseArrayValue(value: String): JsonArray? {
  if (value.isBlank()) return JsonArray(emptyList())
  return runCatching { responseJson.parseToJsonElement(value) as? JsonArray }.getOrNull()
}

private fun parseObjectValue(value: String): JsonObject? {
  if (value.isBlank()) return null
  return runCatching { responseJson.parseToJsonElement(value) as? JsonObject }.getOrNull()
}

private fun arrayStringValues(value: String): List<String> =
  parseArrayValue(value)
    ?.map { item -> (item as? JsonPrimitive)?.contentOrNull ?: item.toString() }
    .orEmpty()

private fun updateArrayItem(value: String, index: Int, item: String): String {
  val items = arrayStringValues(value).toMutableList()
  while (items.size <= index) items.add("")
  items[index] = item
  return encodeStringArray(items)
}

private fun removeArrayItem(value: String, index: Int): String {
  val items = arrayStringValues(value).toMutableList()
  if (index in items.indices) items.removeAt(index)
  return encodeStringArray(items)
}

private fun encodeStringArray(items: List<String>): String =
  JsonArray(items.map { JsonPrimitive(it) }).toString()

private fun String.article(): String =
  if (firstOrNull()?.lowercaseChar() in setOf('a', 'e', 'i', 'o', 'u')) "an" else "a"
