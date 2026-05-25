package com.callumalpass.pickle.ui.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp

@Composable
internal fun MarkdownText(
  text: String,
  modifier: Modifier = Modifier,
  rawLabel: String = "Raw",
) {
  if (text.isBlank()) return
  var raw by rememberSaveable(text) { mutableStateOf(false) }
  Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
      TextButton(onClick = { raw = !raw }) {
        Text(if (raw) "Rendered" else rawLabel)
      }
    }
    SelectionContainer {
      if (raw) {
        RawTextBlock(text)
      } else {
        MarkdownBlocks(text)
      }
    }
  }
}

@Composable
private fun MarkdownBlocks(text: String) {
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    parseMarkdown(text).forEach { block ->
      when (block) {
        is MarkdownBlock.Heading ->
          Text(
            inlineMarkdown(block.text),
            style =
              when (block.level) {
                1 -> MaterialTheme.typography.titleLarge
                2 -> MaterialTheme.typography.titleMedium
                else -> MaterialTheme.typography.titleSmall
              },
            fontWeight = FontWeight.SemiBold,
          )
        is MarkdownBlock.Paragraph ->
          Text(inlineMarkdown(block.text), style = MaterialTheme.typography.bodyLarge)
        is MarkdownBlock.Quote ->
          Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(7.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)),
          ) {
            Text(
              inlineMarkdown(block.text),
              modifier = Modifier.padding(10.dp),
              style = MaterialTheme.typography.bodyMedium,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
          }
        is MarkdownBlock.ListItems ->
          Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
            block.items.forEachIndexed { index, item ->
              val marker = if (block.ordered) "${index + 1}." else "•"
              Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(marker, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(inlineMarkdown(item), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
              }
            }
          }
        is MarkdownBlock.Code ->
          RawTextBlock(block.text)
      }
    }
  }
}

@Composable
internal fun RawTextBlock(text: String, modifier: Modifier = Modifier, style: TextStyle = MaterialTheme.typography.bodyMedium) {
  Surface(
    modifier = modifier.fillMaxWidth(),
    shape = RoundedCornerShape(6.dp),
    color = MaterialTheme.colorScheme.surface,
    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)),
  ) {
    Text(
      text,
      modifier = Modifier.padding(10.dp),
      style = style,
      fontFamily = FontFamily.Monospace,
    )
  }
}

internal fun parseMarkdown(text: String): List<MarkdownBlock> {
  val lines = text.replace("\r\n", "\n").split("\n")
  val blocks = mutableListOf<MarkdownBlock>()
  var index = 0
  while (index < lines.size) {
    val line = lines[index]
    if (line.isBlank()) {
      index++
      continue
    }
    if (line.trimStart().startsWith("```")) {
      val code = mutableListOf<String>()
      index++
      while (index < lines.size && !lines[index].trimStart().startsWith("```")) {
        code.add(lines[index])
        index++
      }
      if (index < lines.size) index++
      blocks.add(MarkdownBlock.Code(code.joinToString("\n")))
      continue
    }
    val heading = headingMatch(line)
    if (heading != null) {
      blocks.add(heading)
      index++
      continue
    }
    if (line.trimStart().startsWith(">")) {
      val quote = mutableListOf<String>()
      while (index < lines.size && lines[index].trimStart().startsWith(">")) {
        quote.add(lines[index].trimStart().removePrefix(">").trimStart())
        index++
      }
      blocks.add(MarkdownBlock.Quote(quote.joinToString("\n")))
      continue
    }
    val listKind = listKind(line)
    if (listKind != null) {
      val items = mutableListOf<String>()
      while (index < lines.size && listKind(lines[index]) == listKind) {
        items.add(stripListMarker(lines[index]))
        index++
      }
      blocks.add(MarkdownBlock.ListItems(ordered = listKind == ListKind.Ordered, items = items))
      continue
    }
    val paragraph = mutableListOf(line.trim())
    index++
    while (
      index < lines.size &&
        lines[index].isNotBlank() &&
        !lines[index].trimStart().startsWith("```") &&
        headingMatch(lines[index]) == null &&
        !lines[index].trimStart().startsWith(">") &&
        listKind(lines[index]) == null
    ) {
      paragraph.add(lines[index].trim())
      index++
    }
    blocks.add(MarkdownBlock.Paragraph(paragraph.joinToString(" ")))
  }
  return blocks
}

internal sealed class MarkdownBlock {
  data class Heading(val level: Int, val text: String) : MarkdownBlock()
  data class Paragraph(val text: String) : MarkdownBlock()
  data class Quote(val text: String) : MarkdownBlock()
  data class ListItems(val ordered: Boolean, val items: List<String>) : MarkdownBlock()
  data class Code(val text: String) : MarkdownBlock()
}

private enum class ListKind {
  Ordered,
  Unordered,
}

private fun headingMatch(line: String): MarkdownBlock.Heading? {
  val trimmed = line.trimStart()
  val level = trimmed.takeWhile { it == '#' }.length
  if (level !in 1..3 || trimmed.getOrNull(level) != ' ') return null
  return MarkdownBlock.Heading(level = level, text = trimmed.drop(level + 1).trim())
}

private fun listKind(line: String): ListKind? {
  val trimmed = line.trimStart()
  if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("+ ")) return ListKind.Unordered
  val dot = trimmed.indexOf(". ")
  return if (dot > 0 && trimmed.take(dot).all { it.isDigit() }) ListKind.Ordered else null
}

private fun stripListMarker(line: String): String {
  val trimmed = line.trimStart()
  if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("+ ")) return trimmed.drop(2).trim()
  val dot = trimmed.indexOf(". ")
  return if (dot > 0) trimmed.drop(dot + 2).trim() else trimmed
}

private fun inlineMarkdown(text: String): AnnotatedString =
  buildAnnotatedString {
    appendInlineMarkdown(text)
  }

private fun AnnotatedString.Builder.appendInlineMarkdown(text: String) {
  var index = 0
  while (index < text.length) {
    val codeStart = text.indexOf('`', index)
    val boldStart = text.indexOf("**", index)
    val italicStart = text.indexOf('*', index)
    val next =
      listOf(codeStart, boldStart, italicStart)
        .filter { it >= index }
        .minOrNull()
        ?: -1
    if (next == -1) {
      append(text.substring(index))
      return
    }
    if (next > index) append(text.substring(index, next))
    when {
      next == codeStart -> {
        val end = text.indexOf('`', codeStart + 1)
        if (end == -1) {
          append(text.substring(next))
          return
        }
        withStyle(SpanStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium)) {
          append(text.substring(codeStart + 1, end))
        }
        index = end + 1
      }
      next == boldStart -> {
        val end = text.indexOf("**", boldStart + 2)
        if (end == -1) {
          append(text.substring(next))
          return
        }
        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
          append(text.substring(boldStart + 2, end))
        }
        index = end + 2
      }
      else -> {
        val end = text.indexOf('*', italicStart + 1)
        if (end == -1) {
          append(text.substring(next))
          return
        }
        withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
          append(text.substring(italicStart + 1, end))
        }
        index = end + 1
      }
    }
  }
}
