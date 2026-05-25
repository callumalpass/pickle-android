package com.callumalpass.pickle

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import com.callumalpass.pickle.data.ConnectionSettings
import com.callumalpass.pickle.data.PickleSettings
import com.callumalpass.pickle.theme.PickleTheme
import com.callumalpass.pickle.ui.main.MainScreen

class MainActivity : ComponentActivity() {
  private val openRequestId = mutableStateOf<String?>(null)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    applyIntentSettings(intent)
    openRequestId.value = intent.requestIdExtra()
    enableEdgeToEdge()
    setContent {
      PickleTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
          MainScreen(
            openRequestId = openRequestId.value,
            onOpenRequestHandled = { openRequestId.value = null },
          )
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    applyIntentSettings(intent)
    openRequestId.value = intent.requestIdExtra()
  }

  private fun applyIntentSettings(intent: Intent) {
    val serverUrl = intent.getStringExtra(EXTRA_SERVER_URL)
    val token = intent.getStringExtra(EXTRA_TOKEN)
    if (!serverUrl.isNullOrBlank() || !token.isNullOrBlank()) {
      val current = PickleSettings(this).load()
      PickleSettings(this)
        .save(
          ConnectionSettings(
            serverUrl = serverUrl?.takeIf { it.isNotBlank() } ?: current.serverUrl,
            token = token?.takeIf { it.isNotBlank() } ?: current.token,
          ),
        )
    }
  }

  private fun Intent.requestIdExtra(): String? =
    getStringExtra(EXTRA_REQUEST_ID)?.trim()?.takeIf { it.isNotBlank() }

  companion object {
    const val EXTRA_SERVER_URL = "pickle_server_url"
    const val EXTRA_TOKEN = "pickle_token"
    const val EXTRA_REQUEST_ID = "pickle_request_id"
  }
}
