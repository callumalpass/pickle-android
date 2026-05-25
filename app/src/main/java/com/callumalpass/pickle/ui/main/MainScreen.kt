package com.callumalpass.pickle.ui.main

import android.Manifest
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarResult
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.callumalpass.pickle.data.ConnectionSettings
import com.callumalpass.pickle.data.PickleAttachment
import com.callumalpass.pickle.data.PickleRequest
import com.callumalpass.pickle.data.PickleUiState
import com.callumalpass.pickle.realtime.PickleRealtimeService
import com.callumalpass.pickle.theme.PickleTheme
import kotlinx.serialization.json.JsonElement

@Composable
fun MainScreen(
  modifier: Modifier = Modifier,
  openRequestId: String? = null,
  onOpenRequestHandled: () -> Unit = {},
  viewModel: MainScreenViewModel = viewModel(factory = MainScreenViewModel.factory(LocalContext.current)),
) {
  val state by viewModel.uiState.collectAsStateWithLifecycle()
  val context = LocalContext.current
  val notificationLauncher =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (granted) {
        PickleRealtimeService.start(context)
        viewModel.setPushEnabled(true)
      } else {
        viewModel.setPushEnabled(false)
      }
    }

  LaunchedEffect(Unit) { viewModel.refresh(state.inboxStatus) }
  LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh(state.inboxStatus) }
  LaunchedEffect(openRequestId) {
    val requestId = openRequestId?.trim()
    if (!requestId.isNullOrBlank()) {
      viewModel.openRequest(requestId)
      onOpenRequestHandled()
    }
  }

  PickleApp(
    state = state,
    openRequestId = openRequestId,
    onRefresh = { status -> viewModel.refresh(status) },
    onSelect = viewModel::select,
    onSaveSettings = viewModel::saveSettings,
    onTestConnection = viewModel::testConnection,
    onStartRealtime = {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
      } else {
        PickleRealtimeService.start(context)
        viewModel.setPushEnabled(true)
      }
    },
    onStopRealtime = {
      PickleRealtimeService.stop(context)
      viewModel.setPushEnabled(false)
    },
    onRespond = viewModel::respond,
    onDismissMessage = viewModel::dismissMessage,
    onLoadAttachment = viewModel::loadAttachment,
    onSendMessage = viewModel::sendMessage,
    onNoticeShown = viewModel::clearNotice,
    modifier = modifier,
  )
}

@Composable
fun PickleApp(
  state: PickleUiState,
  openRequestId: String? = null,
  onRefresh: (String) -> Unit,
  onSelect: (PickleRequest) -> Unit,
  onSaveSettings: (ConnectionSettings) -> Unit,
  onTestConnection: () -> Unit,
  onStartRealtime: () -> Unit,
  onStopRealtime: () -> Unit,
  onRespond: (PickleRequest, JsonElement, () -> Unit) -> Unit,
  onDismissMessage: (PickleRequest, () -> Unit) -> Unit,
  onLoadAttachment: (PickleRequest, PickleAttachment) -> Unit,
  onSendMessage: (String, String, List<String>, () -> Unit) -> Unit,
  onNoticeShown: () -> Unit,
  modifier: Modifier = Modifier,
) {
  var route by rememberSaveable { mutableStateOf(PickleRoute.Inbox.name) }
  var inboxStatus by rememberSaveable { mutableStateOf(state.inboxStatus) }
  var inboxKind by rememberSaveable { mutableStateOf(INBOX_FILTER_ALL) }
  var inboxPriority by rememberSaveable { mutableStateOf(INBOX_FILTER_ALL) }
  var inboxSource by rememberSaveable { mutableStateOf(INBOX_FILTER_ALL) }
  var inboxTag by rememberSaveable { mutableStateOf(INBOX_FILTER_ALL) }
  var inboxQuery by rememberSaveable { mutableStateOf("") }
  val snackbarHostState = remember { SnackbarHostState() }
  val clipboard = LocalClipboardManager.current
  val selected = state.selected ?: state.requests.firstOrNull()
  val inboxFilters =
    InboxFilters(
      status = inboxStatus,
      kind = inboxKind,
      priority = inboxPriority,
      source = inboxSource,
      tag = inboxTag,
      query = inboxQuery,
    )

  fun setInboxFilters(next: InboxFilters) {
    val statusChanged = next.status != inboxStatus
    inboxStatus = next.status
    inboxKind = if (statusChanged) INBOX_FILTER_ALL else next.kind
    inboxPriority = if (statusChanged) INBOX_FILTER_ALL else next.priority
    inboxSource = if (statusChanged) INBOX_FILTER_ALL else next.source
    inboxTag = if (statusChanged) INBOX_FILTER_ALL else next.tag
    inboxQuery = next.query
    if (statusChanged) onRefresh(next.status)
  }

  LaunchedEffect(state.inboxStatus) {
    inboxStatus = state.inboxStatus
  }

  LaunchedEffect(openRequestId) {
    if (!openRequestId.isNullOrBlank()) {
      route = PickleRoute.Detail.name
    }
  }

  BackHandler(enabled = route == PickleRoute.Detail.name) {
    route = PickleRoute.Inbox.name
  }

  LaunchedEffect(state.notice, state.error) {
    val message = state.notice ?: state.error
    if (!message.isNullOrBlank()) {
      val result =
        snackbarHostState.showSnackbar(
          message = message,
          actionLabel = "Copy",
          withDismissAction = true,
          duration = SnackbarDuration.Long,
        )
      if (result == SnackbarResult.ActionPerformed) {
        clipboard.setText(AnnotatedString(message))
      }
      onNoticeShown()
    }
  }

  Scaffold(
    modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
    snackbarHost = { SnackbarHost(snackbarHostState) },
    topBar = {
      PickleTopBar(
        route = route,
        inboxCount = state.requests.size,
        inboxStatus = inboxFilters.status,
        connected = state.connected,
        onBack = { route = PickleRoute.Inbox.name },
        onRefresh = { onRefresh(inboxFilters.status) },
        onStartRealtime = onStartRealtime,
      )
    },
    bottomBar = {
      PickleBottomBar(
        route = route,
        onNavigate = { route = it.name },
      )
    },
  ) { padding ->
    Box(
      modifier =
        Modifier
          .fillMaxSize()
          .padding(padding)
          .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
      when (route) {
        PickleRoute.Detail.name ->
          DetailPage(
            request = selected,
            sending = state.sending,
            onBack = { route = PickleRoute.Inbox.name },
            onRespond = { request, payload ->
              onRespond(request, payload) {
                route = PickleRoute.Inbox.name
              }
            },
            onDismissMessage = { request ->
              onDismissMessage(request) {
                route = PickleRoute.Inbox.name
              }
            },
            attachmentPreviews = state.attachmentPreviews,
            onLoadAttachment = onLoadAttachment,
          )

        PickleRoute.Compose.name ->
          ComposePage(
            sending = state.sending,
            onSend = { title, body, tags ->
              onSendMessage(title, body, tags) {
                route = PickleRoute.Inbox.name
              }
            },
          )

        PickleRoute.Settings.name ->
          SettingsPage(
            settings = state.settings,
            connected = state.connected,
            pushEnabled = state.pushEnabled,
            error = state.error,
            onSave = onSaveSettings,
            onTest = onTestConnection,
            onStartRealtime = onStartRealtime,
            onStopRealtime = onStopRealtime,
          )

        else ->
          InboxPage(
            requests = state.requests,
            loading = state.loading,
            filters = inboxFilters,
            onFiltersChange = ::setInboxFilters,
            onOpen = { request ->
              onSelect(request)
              route = PickleRoute.Detail.name
            },
          )
      }
    }
  }
}

private enum class PickleRoute(val label: String) {
  Inbox("Inbox"),
  Compose("Post"),
  Settings("Settings"),
  Detail("Detail"),
}

@Composable
private fun PickleTopBar(
  route: String,
  inboxCount: Int,
  inboxStatus: String,
  connected: Boolean?,
  onBack: () -> Unit,
  onRefresh: () -> Unit,
  onStartRealtime: () -> Unit,
) {
  val isDetail = route == PickleRoute.Detail.name
  Surface(color = MaterialTheme.colorScheme.surface) {
    Row(
      modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 14.dp, vertical = 10.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      if (isDetail) {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
        }
      } else {
        PickleMark()
      }
      Column(modifier = Modifier.weight(1f)) {
        Text(
          text = if (isDetail) "Detail" else "Pickle",
          style = MaterialTheme.typography.titleLarge,
          fontWeight = FontWeight.SemiBold,
        )
        Text(
          text = if (isDetail) "Structured handoff" else "$inboxCount ${inboxStatusLabel(inboxStatus)}",
          style = MaterialTheme.typography.labelMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      ConnectionDot(connected)
      IconButton(onClick = onRefresh) {
        Icon(Icons.Rounded.Refresh, contentDescription = "Refresh")
      }
      IconButton(onClick = onStartRealtime) {
        Icon(Icons.Rounded.Notifications, contentDescription = "Start push")
      }
    }
  }
}

@Composable
private fun PickleBottomBar(route: String, onNavigate: (PickleRoute) -> Unit) {
  NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
    NavigationBarItem(
      modifier = Modifier.semantics { contentDescription = "Inbox tab" },
      selected = route == PickleRoute.Inbox.name || route == PickleRoute.Detail.name,
      onClick = { onNavigate(PickleRoute.Inbox) },
      icon = { Icon(Icons.Rounded.Inbox, contentDescription = null) },
      label = { Text(PickleRoute.Inbox.label) },
    )
    NavigationBarItem(
      modifier = Modifier.semantics { contentDescription = "Post tab" },
      selected = route == PickleRoute.Compose.name,
      onClick = { onNavigate(PickleRoute.Compose) },
      icon = { Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = null) },
      label = { Text(PickleRoute.Compose.label) },
    )
    NavigationBarItem(
      modifier = Modifier.semantics { contentDescription = "Settings tab" },
      selected = route == PickleRoute.Settings.name,
      onClick = { onNavigate(PickleRoute.Settings) },
      icon = { Icon(Icons.Rounded.Settings, contentDescription = null) },
      label = { Text(PickleRoute.Settings.label) },
    )
  }
}

@Composable
private fun PickleMark(modifier: Modifier = Modifier) {
  Surface(
    modifier = modifier.width(40.dp).height(48.dp),
    shape = RoundedCornerShape(12.dp),
    color = Color(0xFFFFE18B),
    shadowElevation = 0.dp,
  ) {
    Canvas(modifier = Modifier.fillMaxSize().padding(4.dp)) {
      val dark = Color(0xFF1F4E38)
      val body = Color(0xFF2F7D58)
      val light = Color(0xFF7BCB62)
      val cheek = Color(0xFFF37D5A)
      rotate(degrees = -18f, pivot = center) {
        val bodyW = size.width * 0.58f
        val bodyH = size.height * 0.94f
        val bodyLeft = (size.width - bodyW) / 2f
        val bodyTop = (size.height - bodyH) / 2f
        val bodyTopLeft = Offset(bodyLeft, bodyTop)
        val bodySize = Size(bodyW, bodyH)
        val bodyCorner = CornerRadius(bodyW / 2.4f, bodyW / 2.4f)

        drawRoundRect(color = body, topLeft = bodyTopLeft, size = bodySize, cornerRadius = bodyCorner)

        drawRoundRect(
          color = light,
          topLeft = Offset(bodyLeft + bodyW * 0.10f, bodyTop + bodyH * 0.08f),
          size = Size(bodyW * 0.22f, bodyH * 0.84f),
          cornerRadius = CornerRadius(bodyW * 0.11f, bodyW * 0.11f),
        )

        listOf(
          Offset(bodyLeft + bodyW * 0.74f, bodyTop + bodyH * 0.18f),
          Offset(bodyLeft + bodyW * 0.50f, bodyTop + bodyH * 0.60f),
          Offset(bodyLeft + bodyW * 0.76f, bodyTop + bodyH * 0.74f),
          Offset(bodyLeft + bodyW * 0.34f, bodyTop + bodyH * 0.82f),
        ).forEach { spot ->
          drawCircle(color = dark.copy(alpha = 0.45f), radius = 1.3.dp.toPx(), center = spot)
        }

        val cheekRadius = 2.4.dp.toPx()
        drawCircle(color = cheek.copy(alpha = 0.42f), radius = cheekRadius,
          center = Offset(bodyLeft + bodyW * 0.22f, bodyTop + bodyH * 0.40f))
        drawCircle(color = cheek.copy(alpha = 0.42f), radius = cheekRadius,
          center = Offset(bodyLeft + bodyW * 0.78f, bodyTop + bodyH * 0.40f))

        val eyeRadius = 2.0.dp.toPx()
        val sparkleRadius = 0.7.dp.toPx()
        val eyeL = Offset(bodyLeft + bodyW * 0.34f, bodyTop + bodyH * 0.32f)
        val eyeR = Offset(bodyLeft + bodyW * 0.66f, bodyTop + bodyH * 0.32f)
        drawCircle(color = dark, radius = eyeRadius, center = eyeL)
        drawCircle(color = dark, radius = eyeRadius, center = eyeR)
        drawCircle(color = Color.White, radius = sparkleRadius,
          center = Offset(eyeL.x + 0.6.dp.toPx(), eyeL.y - 0.6.dp.toPx()))
        drawCircle(color = Color.White, radius = sparkleRadius,
          center = Offset(eyeR.x + 0.6.dp.toPx(), eyeR.y - 0.6.dp.toPx()))

        val grin =
          Path().apply {
            moveTo(bodyLeft + bodyW * 0.26f, bodyTop + bodyH * 0.50f)
            cubicTo(
              bodyLeft + bodyW * 0.36f, bodyTop + bodyH * 0.66f,
              bodyLeft + bodyW * 0.64f, bodyTop + bodyH * 0.66f,
              bodyLeft + bodyW * 0.74f, bodyTop + bodyH * 0.50f,
            )
          }
        drawPath(grin, color = Color(0xFFFFF6D7), style = Stroke(width = 2.8.dp.toPx(), cap = StrokeCap.Round))
        drawPath(grin, color = dark, style = Stroke(width = 1.2.dp.toPx(), cap = StrokeCap.Round))
      }
    }
  }
}

@Composable
private fun ConnectionDot(connected: Boolean?) {
  val color =
    when (connected) {
      true -> MaterialTheme.colorScheme.primary
      false -> MaterialTheme.colorScheme.tertiary
      null -> MaterialTheme.colorScheme.outline
    }
  Box(modifier = Modifier.height(12.dp).clip(CircleShape).background(color).padding(horizontal = 6.dp))
}

@Preview(showBackground = true, widthDp = 390, heightDp = 820)
@Composable
fun PickleAppPreview() {
  PickleTheme {
    PickleApp(
      state =
        PickleUiState(
          connected = true,
          requests =
            listOf(
              PickleRequest(
                id = "req_preview",
                source = "tasknotes-ops",
                kind = "approval",
                title = "Close TaskNotes issue #1530 as wontfix?",
                message = "Approve closing this issue as wontfix?",
                body = "Agent recommends posting the drafted comment and closing the issue.",
                status = "pending",
                state = "pending",
                priority = "normal",
                responseTypeDefinition = sampleApprovalTypeDefinition(),
                tags = listOf("ops", "review"),
                createdAt = "2026-05-20T21:50:00Z",
                updatedAt = "2026-05-20T21:50:00Z",
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
