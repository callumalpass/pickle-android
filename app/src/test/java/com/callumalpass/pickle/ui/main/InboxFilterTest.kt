package com.callumalpass.pickle.ui.main

import com.callumalpass.pickle.data.PickleRequest
import org.junit.Assert.assertEquals
import org.junit.Test

class InboxFilterTest {
  @Test
  fun filterRequestsKeepsCurrentStatusAndMatchesSearchText() {
    val requests = sampleRequests()

    val filtered =
      filterRequests(
        requests,
        InboxFilters(status = "pending", query = "calendar"),
      )

    assertEquals(listOf("req_calendar"), filtered.map { it.id })
  }

  @Test
  fun filterRequestsCombinesKindPrioritySourceAndTag() {
    val requests = sampleRequests()

    val filtered =
      filterRequests(
        requests,
        InboxFilters(
          status = "pending",
          kind = "approval",
          priority = "high",
          source = "tasknotes",
          tag = "ops",
        ),
      )

    assertEquals(listOf("req_calendar"), filtered.map { it.id })
  }

  @Test
  fun filterRequestsCanShowAnsweredBucket() {
    val requests = sampleRequests()

    val filtered = filterRequests(requests, InboxFilters(status = "answered"))

    assertEquals(listOf("req_done"), filtered.map { it.id })
  }

  @Test
  fun activeFilterCountIncludesStatusAndLocalFilters() {
    val filters =
      InboxFilters(
        status = "answered",
        kind = "approval",
        query = "calendar",
      )

    assertEquals(3, filters.activeFilterCount())
  }

  private fun sampleRequests(): List<PickleRequest> =
    listOf(
      PickleRequest(
        id = "req_calendar",
        source = "tasknotes",
        kind = "approval",
        title = "Approve calendar fix",
        body = "Patch the calendar view refresh path.",
        status = "pending",
        priority = "high",
        tags = listOf("ops", "calendar"),
        createdAt = "2026-05-24T00:00:00Z",
        updatedAt = "2026-05-24T00:00:00Z",
      ),
      PickleRequest(
        id = "req_message",
        source = "agent",
        kind = "message",
        title = "Heads up",
        status = "pending",
        priority = "normal",
        tags = listOf("note"),
        createdAt = "2026-05-24T00:01:00Z",
        updatedAt = "2026-05-24T00:01:00Z",
      ),
      PickleRequest(
        id = "req_done",
        source = "tasknotes",
        kind = "approval",
        title = "Already answered",
        status = "answered",
        priority = "normal",
        tags = listOf("ops"),
        createdAt = "2026-05-24T00:02:00Z",
        updatedAt = "2026-05-24T00:02:00Z",
      ),
    )
}
