package com.callumalpass.pickle.ui.main

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.FilterList
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.callumalpass.pickle.data.PickleRequest

internal const val INBOX_FILTER_ALL = "all"

internal data class InboxFilters(
  val status: String = "pending",
  val kind: String = INBOX_FILTER_ALL,
  val priority: String = INBOX_FILTER_ALL,
  val source: String = INBOX_FILTER_ALL,
  val tag: String = INBOX_FILTER_ALL,
  val query: String = "",
)

@Composable
internal fun InboxPage(
  requests: List<PickleRequest>,
  loading: Boolean,
  filters: InboxFilters,
  onFiltersChange: (InboxFilters) -> Unit,
  onOpen: (PickleRequest) -> Unit,
  modifier: Modifier = Modifier,
) {
  val visibleRequests = filterRequests(requests, filters)
  var filtersExpanded by rememberSaveable { mutableStateOf(false) }
  val activeFilterCount = filters.activeFilterCount()
  Column(modifier = modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Column(modifier = Modifier.weight(1f)) {
        Text("Inbox", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        Text(
          inboxCountLabel(visibleRequests.size, requests.size, filters.status, loading),
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        if (filters.hasActiveFilters()) {
          TextButton(onClick = { onFiltersChange(InboxFilters()) }) {
            Text("Clear")
          }
        }
        TextButton(onClick = { filtersExpanded = !filtersExpanded }) {
          Icon(Icons.Rounded.FilterList, contentDescription = null)
          Text(
            text = if (activeFilterCount == 0) "Filters" else "Filters ($activeFilterCount)",
            modifier = Modifier.padding(start = 6.dp),
          )
          Icon(
            imageVector = if (filtersExpanded) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown,
            contentDescription = null,
            modifier = Modifier.padding(start = 2.dp),
          )
        }
      }
    }

    if (filtersExpanded) {
      InboxFilterBar(
        requests = requests,
        filters = filters,
        onFiltersChange = onFiltersChange,
      )
    } else if (filters.hasActiveFilters()) {
      ActiveFilterSummary(filters)
    }

    if (visibleRequests.isEmpty()) {
      EmptyInbox(
        status = filters.status,
        hasFilters = filters.hasActiveFilters(),
        onClearFilters = { onFiltersChange(InboxFilters()) },
      )
    } else {
      LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
        items(visibleRequests, key = { it.id }) { request ->
          RequestRow(request = request, onClick = { onOpen(request) })
        }
      }
    }
  }
}

@Composable
private fun ActiveFilterSummary(filters: InboxFilters) {
  Surface(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(8.dp),
    color = MaterialTheme.colorScheme.surface,
  ) {
    FlowRow(
      modifier = Modifier.padding(10.dp),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      filters.summaryLabels().forEach { label ->
        FilterSummaryChip(label)
      }
    }
  }
}

@Composable
private fun FilterSummaryChip(label: String) {
  Surface(
    shape = RoundedCornerShape(999.dp),
    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f),
  ) {
    Text(
      text = label,
      modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
      style = MaterialTheme.typography.labelSmall,
      fontWeight = FontWeight.Medium,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
  }
}

@Composable
private fun InboxFilterBar(
  requests: List<PickleRequest>,
  filters: InboxFilters,
  onFiltersChange: (InboxFilters) -> Unit,
) {
  Surface(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(8.dp),
    color = MaterialTheme.colorScheme.surface,
  ) {
    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      OutlinedTextField(
        value = filters.query,
        onValueChange = { onFiltersChange(filters.copy(query = it)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        label = { Text("Search") },
        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
        trailingIcon =
          if (filters.query.isNotBlank()) {
            {
              IconButton(onClick = { onFiltersChange(filters.copy(query = "")) }) {
                Icon(Icons.Rounded.Close, contentDescription = "Clear search")
              }
            }
          } else {
            null
          },
      )

      FilterSection(label = "Status") {
        listOf("pending", "answered", "conflict", "cancelled").forEach { status ->
          FilterChip(
            selected = filters.status == status,
            onClick = { onFiltersChange(filters.copy(status = status)) },
            label = { Text(status.prettyFilterLabel()) },
          )
        }
      }

      FilterSection(label = "Kind") {
        FilterChips(
          values = optionValues(requests.map { it.kind }),
          selected = filters.kind,
          onSelect = { onFiltersChange(filters.copy(kind = it)) },
        )
      }

      FilterSection(label = "Priority") {
        FilterChips(
          values = optionValues(requests.map { it.priority }),
          selected = filters.priority,
          onSelect = { onFiltersChange(filters.copy(priority = it)) },
        )
      }

      val sources = optionValues(requests.map { it.source })
      if (sources.size > 2) {
        FilterSection(label = "Source") {
          FilterChips(
            values = sources,
            selected = filters.source,
            onSelect = { onFiltersChange(filters.copy(source = it)) },
          )
        }
      }

      val tags = optionValues(requests.flatMap { it.tags })
      if (tags.size > 2) {
        FilterSection(label = "Tag") {
          FilterChips(
            values = tags,
            selected = filters.tag,
            onSelect = { onFiltersChange(filters.copy(tag = it)) },
          )
        }
      }
    }
  }
}

@Composable
private fun FilterSection(label: String, content: @Composable () -> Unit) {
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      content()
    }
  }
}

@Composable
private fun FilterChips(values: List<String>, selected: String, onSelect: (String) -> Unit) {
  values.forEach { value ->
    FilterChip(
      selected = selected == value,
      onClick = { onSelect(value) },
      label = { Text(value.prettyFilterLabel()) },
    )
  }
}

@Composable
private fun EmptyInbox(status: String, hasFilters: Boolean, onClearFilters: () -> Unit) {
  Surface(
    modifier = Modifier.fillMaxSize(),
    shape = RoundedCornerShape(8.dp),
    color = MaterialTheme.colorScheme.surface,
  ) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
      Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
          if (hasFilters) "No matching handoffs" else "Nothing ${inboxStatusLabel(status)}",
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.SemiBold,
        )
        Text(
          if (hasFilters) "Adjust or clear filters." else "Use the top refresh button to check again.",
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (hasFilters) {
          Button(onClick = onClearFilters, shape = RoundedCornerShape(7.dp)) {
            Text("Clear filters")
          }
        }
      }
    }
  }
}

@Composable
private fun RequestRow(request: PickleRequest, onClick: () -> Unit) {
  Surface(
    modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    shape = RoundedCornerShape(8.dp),
    color = MaterialTheme.colorScheme.surface,
  ) {
    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
      Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
          Text(
            request.title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
          )
          Text(
            "${request.source} / ${formatTimestamp(request.createdAt)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
          )
        }
        KindChip(request.kind, request.priority)
      }
      if (request.body.isNotBlank()) {
        Text(
          request.body,
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          maxLines = 3,
          overflow = TextOverflow.Ellipsis,
        )
      }
      TagRow(request.tags)
    }
  }
}

internal fun filterRequests(requests: List<PickleRequest>, filters: InboxFilters): List<PickleRequest> =
  requests.filter { request ->
    request.state == filters.status &&
      filters.matches(filters.kind, request.kind) &&
      filters.matches(filters.priority, request.priority) &&
      filters.matches(filters.source, request.source) &&
      (filters.tag == INBOX_FILTER_ALL || request.tags.contains(filters.tag)) &&
      request.matchesQuery(filters.query)
  }

internal fun inboxStatusLabel(status: String): String =
  when (status) {
    "pending" -> "pending"
    "answered" -> "answered"
    "conflict" -> "conflicts"
    "cancelled" -> "cancelled"
    else -> status
  }

private fun inboxCountLabel(visible: Int, loaded: Int, status: String, loading: Boolean): String {
  if (loading) return "Refreshing ${inboxStatusLabel(status)}"
  val statusLabel = inboxStatusLabel(status)
  return if (visible == loaded) "$loaded $statusLabel" else "$visible of $loaded $statusLabel"
}

private fun InboxFilters.matches(filter: String, value: String): Boolean =
  filter == INBOX_FILTER_ALL || filter == value

private fun InboxFilters.hasActiveFilters(): Boolean =
  status != "pending" || hasActiveLocalFilters()

private fun InboxFilters.hasActiveLocalFilters(): Boolean =
  kind != INBOX_FILTER_ALL ||
    priority != INBOX_FILTER_ALL ||
    source != INBOX_FILTER_ALL ||
    tag != INBOX_FILTER_ALL ||
    query.isNotBlank()

internal fun InboxFilters.activeFilterCount(): Int =
  listOf(
    status != "pending",
    kind != INBOX_FILTER_ALL,
    priority != INBOX_FILTER_ALL,
    source != INBOX_FILTER_ALL,
    tag != INBOX_FILTER_ALL,
    query.isNotBlank(),
  ).count { it }

private fun InboxFilters.summaryLabels(): List<String> =
  buildList {
    if (status != "pending") add("Status: ${status.prettyFilterLabel()}")
    if (kind != INBOX_FILTER_ALL) add("Kind: ${kind.prettyFilterLabel()}")
    if (priority != INBOX_FILTER_ALL) add("Priority: ${priority.prettyFilterLabel()}")
    if (source != INBOX_FILTER_ALL) add("Source: $source")
    if (tag != INBOX_FILTER_ALL) add("Tag: #$tag")
    if (query.isNotBlank()) add("Search: ${query.trim()}")
  }

private fun PickleRequest.matchesQuery(query: String): Boolean {
  val q = query.trim()
  if (q.isBlank()) return true
  return listOf(id, title, message, body, source, kind, priority, state, createdAt, updatedAt)
    .plus(tags)
    .any { it.contains(q, ignoreCase = true) }
}

private fun optionValues(values: List<String>): List<String> {
  val filtered = values.map { it.trim() }.filter { it.isNotBlank() }.distinct().sorted()
  return listOf(INBOX_FILTER_ALL) + filtered
}

private fun String.prettyFilterLabel(): String =
  if (this == INBOX_FILTER_ALL) {
    "All"
  } else {
    replaceFirstChar { char -> char.uppercase() }
  }
