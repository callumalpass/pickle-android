package com.callumalpass.pickle.ui.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
internal fun TagRow(tags: List<String>, modifier: Modifier = Modifier) {
  if (tags.isEmpty()) return
  FlowRow(
    modifier = modifier,
    horizontalArrangement = Arrangement.spacedBy(6.dp),
    verticalArrangement = Arrangement.spacedBy(6.dp),
  ) {
    tags.forEach { tag -> TagChip(tag) }
  }
}

@Composable
internal fun TagChip(tag: String) {
  Surface(
    shape = RoundedCornerShape(999.dp),
    color = MaterialTheme.colorScheme.secondaryContainer,
    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.55f)),
  ) {
    Text(
      text = "#$tag",
      modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
      style = MaterialTheme.typography.labelSmall,
      fontWeight = FontWeight.Medium,
      color = MaterialTheme.colorScheme.onSecondaryContainer,
    )
  }
}

@Composable
internal fun KindChip(kind: String, priority: String) {
  val color =
    when (kind) {
      "message" -> MaterialTheme.colorScheme.secondaryContainer
      "approval" -> MaterialTheme.colorScheme.primaryContainer
      else -> MaterialTheme.colorScheme.surfaceVariant
    }
  val label = if (priority == "normal") kind else "$kind / $priority"
  Surface(shape = RoundedCornerShape(999.dp), color = color) {
    Text(
      text = label,
      modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
      style = MaterialTheme.typography.labelSmall,
      fontWeight = FontWeight.SemiBold,
    )
  }
}

internal fun formatTimestamp(raw: String): String =
  raw
    .replace("T", " ")
    .substringBefore(".")
    .removeSuffix("Z")

internal fun parseTagInput(raw: String): List<String> {
  val seen = linkedSetOf<String>()
  raw
    .split(",", " ", "\n", "\t")
    .map { it.trim().trimStart('#') }
    .filter { it.isNotEmpty() }
    .forEach { seen.add(it) }
  return seen.toList()
}
