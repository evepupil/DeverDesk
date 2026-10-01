import { describe, expect, it } from "vitest"

import {
  beginActivityListRequest,
  failActivityListRequest,
  isChangesetConflict,
  receiveActivityFirstPage,
  receiveActivityNextPage,
  shouldAutoLoadActivityPage,
  shouldRecoverActivityAuthorization,
  shouldRefreshAfterActionFailure,
  shouldScheduleActivityRefresh,
  type ActivityListSnapshot,
} from "./activity-state"

interface Item {
  id: string
  value: string
}

const loadedList: ActivityListSnapshot<Item> = {
  items: [{ id: "a", value: "old first" }, { id: "b", value: "second page" }],
  cursor: "old-cursor",
  hasMore: true,
  loading: false,
  loaded: true,
  error: null,
}

describe("AI activity list transitions", () => {
  it("keeps existing data while a refresh is in flight", () => {
    expect(beginActivityListRequest(loadedList)).toEqual({
      ...loadedList,
      loading: true,
      error: null,
    })
  })

  it("preserves data and cursor after failed refreshes or page loads", () => {
    const failedRefresh = failActivityListRequest(beginActivityListRequest(loadedList), false)
    expect(failedRefresh).toEqual({ ...loadedList, error: "refresh" })
    expect(shouldAutoLoadActivityPage(failedRefresh.hasMore, failedRefresh.loading, failedRefresh.error !== null)).toBe(false)

    const failedPage = failActivityListRequest(beginActivityListRequest(loadedList), true)
    expect(failedPage).toEqual({ ...loadedList, error: "append" })
    expect(shouldAutoLoadActivityPage(failedPage.hasMore, failedPage.loading, failedPage.error !== null)).toBe(false)
    expect(shouldAutoLoadActivityPage(failedPage.hasMore, false, false)).toBe(true)
  })

  it("merges a refreshed first page without dropping previously loaded history", () => {
    const refreshed = receiveActivityFirstPage(
      loadedList,
      { items: [{ id: "a", value: "updated first" }, { id: "c", value: "new first page" }], nextCursor: "new-cursor" },
      true
    )
    expect(refreshed.items).toEqual([
      { id: "a", value: "updated first" },
      { id: "c", value: "new first page" },
      { id: "b", value: "second page" },
    ])
    expect(refreshed.cursor).toBe("new-cursor")
    expect(refreshed.loaded).toBe(true)
    expect(refreshed.loading).toBe(false)
  })

  it("replaces pending pages but appends history pages without duplicates", () => {
    const pending = receiveActivityFirstPage(
      loadedList,
      { items: [{ id: "a", value: "current proposal" }], nextCursor: null },
      false
    )
    expect(pending.items).toEqual([{ id: "a", value: "current proposal" }])
    expect(pending.hasMore).toBe(false)

    const next = receiveActivityNextPage(loadedList, {
      items: [{ id: "b", value: "duplicate" }, { id: "c", value: "third" }, { id: "c", value: "duplicate page item" }],
      nextCursor: null,
    })
    expect(next.items).toEqual([...loadedList.items, { id: "c", value: "third" }])
  })
})

describe("AI activity refresh decisions", () => {
  it("resumes after a successful sync and schedules only while enabled and authorized", () => {
    expect(shouldRecoverActivityAuthorization(true, "synced")).toBe(true)
    expect(shouldRecoverActivityAuthorization(true, "syncing")).toBe(false)
    expect(shouldRecoverActivityAuthorization(false, "synced")).toBe(false)
    expect(shouldScheduleActivityRefresh(true, false)).toBe(true)
    expect(shouldScheduleActivityRefresh(true, true)).toBe(false)
    expect(shouldScheduleActivityRefresh(false, false)).toBe(false)
  })

  it("refreshes after failed accept/undo and recognizes stale-action conflicts", () => {
    expect(shouldRefreshAfterActionFailure("accept")).toBe(true)
    expect(shouldRefreshAfterActionFailure("undo")).toBe(true)
    expect(shouldRefreshAfterActionFailure("reject")).toBe(false)
    expect(isChangesetConflict(409)).toBe(true)
    expect(isChangesetConflict(500)).toBe(false)
    expect(isChangesetConflict(undefined)).toBe(false)
  })
})
