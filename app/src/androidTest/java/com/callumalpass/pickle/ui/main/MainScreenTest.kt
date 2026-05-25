package com.callumalpass.pickle.ui.main

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.callumalpass.pickle.data.PickleRequest
import com.callumalpass.pickle.data.PickleUiState
import com.callumalpass.pickle.theme.PickleTheme
import org.junit.Rule
import org.junit.Test

class MainScreenTest {
  @get:Rule val composeTestRule = createAndroidComposeRule<ComponentActivity>()

  @Test
  fun pagesAreSeparateAndNavigable() {
    composeTestRule.setContent {
      PickleTheme {
        PickleApp(
          state =
            PickleUiState(
              requests =
                listOf(
                  PickleRequest(
                    id = "req_test",
                    source = "agent",
                    kind = "approval",
                    title = "Approve test",
                    status = "pending",
                    createdAt = "2026-05-20T00:00:00Z",
                    updatedAt = "2026-05-20T00:00:00Z",
                  ),
                ),
            ),
          onRefresh = { _ -> },
          onSelect = {},
          onSaveSettings = {},
          onTestConnection = {},
          onStartRealtime = {},
          onStopRealtime = {},
          onRespond = { _, _, done -> done() },
          onDismissMessage = { _, done -> done() },
          onLoadAttachment = { _, _ -> },
          onSendMessage = { _, _, _, done -> done() },
          onNoticeShown = {},
        )
      }
    }
    composeTestRule.onNodeWithText("Pickle").assertExists()
    composeTestRule.onNodeWithContentDescription("Inbox tab").assertExists()
    composeTestRule.onNodeWithText("Approve test").performClick()
    composeTestRule.onNodeWithText("Detail").assertExists()
    composeTestRule.activityRule.scenario.onActivity {
      it.onBackPressedDispatcher.onBackPressed()
    }
    composeTestRule.onNodeWithText("Approve test").assertExists()
    composeTestRule.onNodeWithText("Approve test").performClick()
    composeTestRule.onNodeWithText("Detail").assertExists()
    composeTestRule.onNodeWithContentDescription("Back").performClick()
    composeTestRule.onNodeWithContentDescription("Post tab").performClick()
    composeTestRule.onNodeWithText("Title").performTextInput("hello agents")
    composeTestRule.onNodeWithText("Tags").performTextInput("ops follow-up")
    composeTestRule.onNodeWithText("#ops").assertExists()
    composeTestRule.onNodeWithContentDescription("Settings tab").performClick()
    composeTestRule.onNodeWithText("Server").assertExists()
  }
}
