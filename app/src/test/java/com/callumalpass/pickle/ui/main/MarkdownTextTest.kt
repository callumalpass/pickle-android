package com.callumalpass.pickle.ui.main

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MarkdownTextTest {
  @Test
  fun parseMarkdownKeepsCommonBlocksInOrder() {
    val blocks =
      parseMarkdown(
        """
        # Heading

        Agent recommends **approving** the change.

        - first
        - second

        > quoted note

        ```json
        {"decision":"approve"}
        ```
        """.trimIndent(),
      )

    assertEquals(MarkdownBlock.Heading(1, "Heading"), blocks[0])
    assertEquals(MarkdownBlock.Paragraph("Agent recommends **approving** the change."), blocks[1])
    assertEquals(MarkdownBlock.ListItems(ordered = false, items = listOf("first", "second")), blocks[2])
    assertEquals(MarkdownBlock.Quote("quoted note"), blocks[3])
    assertEquals(MarkdownBlock.Code("""{"decision":"approve"}"""), blocks[4])
  }

  @Test
  fun parseMarkdownRecognizesOrderedLists() {
    val blocks = parseMarkdown("1. review\n2. ship")

    assertTrue(blocks.single() is MarkdownBlock.ListItems)
    assertEquals(MarkdownBlock.ListItems(ordered = true, items = listOf("review", "ship")), blocks.single())
  }
}
