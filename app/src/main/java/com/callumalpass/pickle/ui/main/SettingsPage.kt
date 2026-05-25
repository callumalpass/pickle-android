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
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.NotificationsOff
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.callumalpass.pickle.data.ConnectionSettings

@Composable
internal fun SettingsPage(
  settings: ConnectionSettings,
  connected: Boolean?,
  pushEnabled: Boolean,
  error: String?,
  onSave: (ConnectionSettings) -> Unit,
  onTest: () -> Unit,
  onStartRealtime: () -> Unit,
  onStopRealtime: () -> Unit,
  modifier: Modifier = Modifier,
) {
  var serverUrl by rememberSaveable(settings.serverUrl) { mutableStateOf(settings.serverUrl) }
  var token by rememberSaveable(settings.token) { mutableStateOf(settings.token) }
  var collection by rememberSaveable(settings.collection) { mutableStateOf(settings.collection) }

  Column(
    modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Column {
      Text("Settings", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
      Text(connectionLabel(connected), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Surface(
      modifier = Modifier.fillMaxWidth(),
      shape = RoundedCornerShape(8.dp),
      color = MaterialTheme.colorScheme.surface,
      border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
      Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
          value = serverUrl,
          onValueChange = { serverUrl = it },
          label = { Text("Server") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
          value = token,
          onValueChange = { token = it },
          label = { Text("Token") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
          value = collection,
          onValueChange = { collection = it },
          label = { Text("Collection") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
          Button(onClick = { onSave(ConnectionSettings(serverUrl, token, collection)) }, shape = RoundedCornerShape(7.dp)) {
            Text("Save")
          }
          OutlinedButton(onClick = onTest, shape = RoundedCornerShape(7.dp)) {
            Text("Test")
          }
        }
        if (!error.isNullOrBlank()) {
          SelectionContainer {
            Text(error, color = MaterialTheme.colorScheme.tertiary, style = MaterialTheme.typography.bodySmall)
          }
        }
      }
    }

    Surface(
      modifier = Modifier.fillMaxWidth(),
      shape = RoundedCornerShape(8.dp),
      color = MaterialTheme.colorScheme.surface,
      border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
      Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Push", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(
          if (pushEnabled) "Background push is enabled" else "Background push is stopped",
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          Button(onClick = onStartRealtime, shape = RoundedCornerShape(7.dp)) {
            Icon(Icons.Rounded.Notifications, contentDescription = null)
            Text("Start", modifier = Modifier.padding(start = 8.dp))
          }
          OutlinedButton(onClick = onStopRealtime, shape = RoundedCornerShape(7.dp)) {
            Icon(Icons.Rounded.NotificationsOff, contentDescription = null)
            Text("Stop", modifier = Modifier.padding(start = 8.dp))
          }
        }
      }
    }
  }
}

private fun connectionLabel(connected: Boolean?): String =
  when (connected) {
    true -> "Connected"
    false -> "Offline"
    null -> "Not checked"
  }
