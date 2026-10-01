import type { SyncStatus } from "@/state/sync"

export type ActivityListError = "refresh" | "append"

export interface ActivityListSnapshot<T> {
  items: T[]
  cursor: string | null
  hasMore: boolean
  loading: boolean
  loaded: boolean
  error: ActivityListError | null
}

export interface ActivityPage<T> {
  items: T[]
  nextCursor: string | null
}

export function beginActivityListRequest<T>(state: ActivityListSnapshot<T>): ActivityListSnapshot<T> {
  return { ...state, loading: true, error: null }
}

export function failActivityListRequest<T>(
  state: ActivityListSnapshot<T>,
  append: boolean
): ActivityListSnapshot<T> {
  return { ...state, loading: false, error: append ? "append" : "refresh" }
}

function appendUnique<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const ids = new Set(existing.map((item) => item.id))
  const additions = incoming.filter((item) => {
    if (ids.has(item.id)) return false
    ids.add(item.id)
    return true
  })
  return [...existing, ...additions]
}

export function receiveActivityFirstPage<T extends { id: string }>(
  state: ActivityListSnapshot<T>,
  page: ActivityPage<T>,
  preserveLoadedPages: boolean
): ActivityListSnapshot<T> {
  const firstPageIds = new Set(page.items.map((item) => item.id))
  const items = preserveLoadedPages
    ? [...page.items, ...state.items.filter((item) => !firstPageIds.has(item.id))]
    : page.items
  return {
    items,
    cursor: page.nextCursor,
    hasMore: page.nextCursor !== null,
    loading: false,
    loaded: true,
    error: null,
  }
}

export function receiveActivityNextPage<T extends { id: string }>(
  state: ActivityListSnapshot<T>,
  page: ActivityPage<T>
): ActivityListSnapshot<T> {
  return {
    items: appendUnique(state.items, page.items),
    cursor: page.nextCursor,
    hasMore: page.nextCursor !== null,
    loading: false,
    loaded: true,
    error: null,
  }
}

export function shouldAutoLoadActivityPage(hasMore: boolean, loading: boolean, error: boolean): boolean {
  return hasMore && !loading && !error
}

export function shouldScheduleActivityRefresh(enabled: boolean, unauthorized: boolean): boolean {
  return enabled && !unauthorized
}

export function shouldRecoverActivityAuthorization(unauthorized: boolean, status: SyncStatus): boolean {
  return unauthorized && status === "synced"
}

export type ActivityAction = "accept" | "reject" | "undo"

export function shouldRefreshAfterActionFailure(action: ActivityAction): boolean {
  return action === "accept" || action === "undo"
}

export function isChangesetConflict(status: number | undefined): boolean {
  return status === 409
}
