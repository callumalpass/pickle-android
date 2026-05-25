package com.callumalpass.pickle.ui.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
internal fun ComposePage(
  sending: Boolean,
  onSend: (String, String, List<String>) -> Unit,
  modifier: Modifier = Modifier,
) {
  var title by rememberSaveable { mutableStateOf("") }
  var body by rememberSaveable { mutableStateOf("") }
  var tagInput by rememberSaveable { mutableStateOf("") }
  var showTitleError by remember { mutableStateOf(false) }
  val tags = parseTagInput(tagInput)

  Column(
    modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Column {
      Text("Post", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
      Text("Send an unprompted note into Pickle.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Surface(
      modifier = Modifier.fillMaxWidth(),
      shape = RoundedCornerShape(8.dp),
      color = MaterialTheme.colorScheme.surface,
      border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
      Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
          value = title,
          onValueChange = {
            title = it
            showTitleError = false
          },
          label = { Text("Title") },
          isError = showTitleError,
          supportingText = if (showTitleError) ({ Text("Title is required") }) else null,
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
          value = tagInput,
          onValueChange = { tagInput = it },
          label = { Text("Tags") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        TagRow(tags)
        OutlinedTextField(
          value = body,
          onValueChange = { body = it },
          label = { Text("Message") },
          minLines = 5,
          modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          Button(
            enabled = !sending,
            onClick = {
              if (title.isBlank()) {
                showTitleError = true
              } else {
                onSend(title, body, tags)
                title = ""
                body = ""
                tagInput = ""
              }
            },
            shape = RoundedCornerShape(7.dp),
          ) {
            Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = null)
            Text(if (sending) "Posting" else "Post message", modifier = Modifier.padding(start = 8.dp))
          }
        }
      }
    }
  }
}
