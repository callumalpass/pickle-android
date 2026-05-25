package com.callumalpass.pickle.ui.main

import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.callumalpass.pickle.data.AttachmentPreview
import com.callumalpass.pickle.data.PickleAttachment
import com.callumalpass.pickle.data.PickleLink
import com.callumalpass.pickle.data.PickleRequest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Composable
internal fun DetailPage(
  request: PickleRequest?,
  sending: Boolean,
  onBack: () -> Unit,
  onRespond: (PickleRequest, JsonElement) -> Unit,
  onDismissMessage: (PickleRequest) -> Unit,
  attachmentPreviews: Map<String, AttachmentPreview> = emptyMap(),
  onLoadAttachment: (PickleRequest, PickleAttachment) -> Unit = { _, _ -> },
  modifier: Modifier = Modifier,
) {
  if (request == null) {
    Column(modifier = modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Button(onClick = onBack, shape = RoundedCornerShape(7.dp)) {
        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null)
        Text("Inbox", modifier = Modifier.padding(start = 8.dp))
      }
      EmptyDetail()
    }
    return
  }

  Column(
    modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Surface(
      modifier = Modifier.fillMaxWidth(),
      shape = RoundedCornerShape(8.dp),
      color = MaterialTheme.colorScheme.surface,
      border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
      Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          KindChip(request.kind, request.priority)
          TagRow(request.tags)
        }
        SelectionContainer {
          Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(request.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            if (request.message.isNotBlank()) {
              Text(request.message, style = MaterialTheme.typography.bodyLarge)
            }
            Text(
              "${request.source} / ${formatTimestamp(request.createdAt)}",
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
          }
        }
        if (request.body.isNotBlank() && request.body != request.message) {
          MarkdownText(request.body)
        }
        LinkBlock(request.links)
        AttachmentBlock(request, attachmentPreviews, onLoadAttachment)
      }
    }

    if (request.response != null) {
      AnsweredReceipt(request)
    } else if (request.kind == "message") {
      Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.secondaryContainer,
      ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text(
            "Posted message",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
          )
          Button(onClick = { onDismissMessage(request) }, shape = RoundedCornerShape(7.dp)) {
            Icon(Icons.Rounded.Check, contentDescription = null)
            Text("Dismiss", modifier = Modifier.padding(start = 8.dp))
          }
        }
      }
    } else {
      ResponseForm(request, sending, onRespond)
    }

    OutlinedButton(onClick = onBack, shape = RoundedCornerShape(7.dp)) {
      Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null)
      Text("Back to inbox", modifier = Modifier.padding(start = 8.dp))
    }
  }
}

@Composable
private fun EmptyDetail() {
  Surface(
    modifier = Modifier.fillMaxSize(),
    shape = RoundedCornerShape(8.dp),
    color = MaterialTheme.colorScheme.surface,
    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
  ) {
    Text(
      "No handoff selected",
      modifier = Modifier.padding(24.dp),
      style = MaterialTheme.typography.titleMedium,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
  }
}

@Composable
private fun LinkBlock(links: List<PickleLink>) {
  if (links.isEmpty()) return
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text("Links", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
    SelectionContainer {
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        links.forEach { link ->
          Text("${link.label}: ${link.url ?: link.path}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
      }
    }
  }
}

@Composable
private fun AttachmentBlock(
  request: PickleRequest,
  previews: Map<String, AttachmentPreview>,
  onLoadAttachment: (PickleRequest, PickleAttachment) -> Unit,
) {
  if (request.attachments.isEmpty()) return
  var expanded by rememberSaveable(request.id) { mutableStateOf(false) }
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Surface(
      modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
      shape = RoundedCornerShape(7.dp),
      color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
      border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)),
    ) {
      Row(
        modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
      ) {
        Icon(Icons.Rounded.AttachFile, contentDescription = null)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
          Text(
            attachmentCountLabel(request.attachments),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
          )
          Text(
            attachmentPreviewLabel(request.attachments),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
          )
        }
        Icon(
          imageVector = if (expanded) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown,
          contentDescription = if (expanded) "Collapse attachments" else "Expand attachments",
        )
      }
    }
    if (expanded) {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        request.attachments.forEach { attachment ->
          LaunchedEffect(request.id, attachment.id) {
            onLoadAttachment(request, attachment)
          }
          AttachmentPreviewItem(
            attachment = attachment,
            preview = previews[attachment.id] ?: AttachmentPreview(loading = true),
          )
        }
      }
    }
  }
}

@Composable
private fun AttachmentPreviewItem(attachment: PickleAttachment, preview: AttachmentPreview) {
  Surface(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(7.dp),
    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.55f)),
  ) {
    Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Rounded.AttachFile, contentDescription = null)
        Column {
          Text(attachment.filename, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
          Text(
            "${attachment.contentType} / ${formatBytes(attachment.sizeBytes)}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      }
      when {
        preview.loading -> Text("Loading preview...", style = MaterialTheme.typography.bodySmall)
        preview.error != null -> Text(preview.error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        preview.text != null ->
          if (attachment.isMarkdown()) {
            MarkdownText(preview.text, rawLabel = "Raw attachment")
          } else {
            SelectionContainer {
              RawTextBlock(
                preview.text,
                style =
                  MaterialTheme.typography.bodyMedium.copy(
                    fontFamily = FontFamily.Monospace,
                  ),
              )
            }
          }
        preview.imageBytes != null -> {
          val bitmap =
            remember(preview.imageBytes) {
              BitmapFactory.decodeByteArray(preview.imageBytes, 0, preview.imageBytes.size)
            }
          if (bitmap != null) {
            Image(
              bitmap = bitmap.asImageBitmap(),
              contentDescription = attachment.filename,
              modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp),
              contentScale = ContentScale.Fit,
            )
          } else {
            Text("Image preview failed", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
          }
        }
      }
    }
  }
}

@Composable
private fun AnsweredReceipt(request: PickleRequest) {
  val response = request.response ?: return
  Surface(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(8.dp),
    color = MaterialTheme.colorScheme.surface,
    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
  ) {
    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Answered", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        KindChip("receipt", request.priority)
      }
      Text(
        "${response.responder} / ${formatTimestamp(response.createdAt)}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )

      ResponseSummary(response.payload)

      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Audit trail", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
        ReceiptField("Request", request.id)
        ReceiptField("Created", formatTimestamp(request.createdAt))
        ReceiptField("Answered", request.answeredAt?.let(::formatTimestamp) ?: formatTimestamp(response.createdAt))
        ReceiptField("State", request.state)
      }

      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Raw response", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
        SelectionContainer {
          RawTextBlock(formatJson(response.payload))
        }
      }
    }
  }
}

@Composable
private fun ResponseSummary(payload: JsonElement) {
  val payloadObject = payload as? JsonObject ?: return
  if (payloadObject.isEmpty()) return
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text("Response summary", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
    payloadObject.entries.forEach { (key, value) ->
      ReceiptField(key.prettyFieldLabel(), value.summaryValue())
    }
  }
}

@Composable
private fun ReceiptField(label: String, value: String) {
  Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    SelectionContainer {
      Text(value, style = MaterialTheme.typography.bodyMedium)
    }
  }
}

private fun formatBytes(bytes: Long): String =
  when {
    bytes >= 1024 * 1024 -> "%.1f MB".format(bytes / (1024.0 * 1024.0))
    bytes >= 1024 -> "%.1f KB".format(bytes / 1024.0)
    else -> "$bytes B"
  }

private fun attachmentCountLabel(attachments: List<PickleAttachment>): String {
  val count = attachments.size
  val noun = if (count == 1) "Attachment" else "Attachments"
  return "$count $noun"
}

private fun attachmentPreviewLabel(attachments: List<PickleAttachment>): String {
  val totalBytes = attachments.sumOf { it.sizeBytes }
  val names = attachments.take(3).joinToString(", ") { it.filename }
  val suffix = if (attachments.size > 3) " +${attachments.size - 3} more" else ""
  return "${formatBytes(totalBytes)} / $names$suffix"
}

private val prettyJson =
  Json {
    prettyPrint = true
  }

private fun formatJson(element: JsonElement): String =
  runCatching { prettyJson.encodeToString(JsonElement.serializer(), element) }.getOrDefault(element.toString())

private fun PickleAttachment.isMarkdown(): Boolean {
  val normalized = contentType.substringBefore(";").trim().lowercase()
  return normalized == "text/markdown" || normalized == "application/markdown" || filename.endsWith(".md", ignoreCase = true)
}

private fun JsonElement.summaryValue(): String =
  when (this) {
    is JsonPrimitive -> contentOrNull ?: toString()
    is JsonArray -> if (size <= 4) joinToString(", ") { it.summaryValue() } else "${size} items"
    is JsonObject -> "${size} fields"
  }

private fun String.prettyFieldLabel(): String =
  split("_", "-")
    .filter { it.isNotBlank() }
    .joinToString(" ") { part -> part.replaceFirstChar { it.uppercase() } }
