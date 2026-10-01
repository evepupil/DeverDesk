"use client"

import { useEffect } from "react"
import { create } from "zustand"

import { acceptChangeset, listChangesets, rejectChangeset, undoChangeset, type ChangesetListStatus } from "@/lib/ai-api"
import { ApiFailure } from "@/lib/api"
import { syncNow, useSync } from "@/state/sync"
import type { ChangesetActionResponse, AiChangeset } from "@/sync/protocol"
import {
  beginActivityListRequest,
  failActivityListRequest,
  receiveActivityFirstPage,
  receiveActivityNextPage,
  shouldRecoverActivityAuthorization,
  shouldScheduleActivityRefresh,
  shouldRefreshAfterActionFailure,
  type ActivityAction,
  type ActivityListSnapshot,
} from "./activity-state"

export type ActivityTab = ChangesetListStatus

interface AiActivityState {
  drawerOpen: boolean
  tab: ActivityTab
  pendingCount: number
  pendingChangesets: AiChangeset[]
  allChangesets: AiChangeset[]
  pendingCursor: string | null
  allCursor: string | null
  pendingHasMore: boolean
  allHasMore: boolean
  pendingLoading: boolean
  allLoading: boolean
  pendingLoaded: boolean
  allLoaded: boolean
  pendingError: boolean
  allError: boolean
  pendingAppendError: boolean
  allAppendError: boolean
  unauthorized: boolean
}

const INITIAL_STATE: AiActivityState = {
  drawerOpen: false,
  tab: "pending",
  pendingCount: 0,
  pendingChangesets: [],
  allChangesets: [],
  pendingCursor: null,
  allCursor: null,
  pendingHasMore: true,
  allHasMore: true,
  pendingLoading: false,
  allLoading: false,
  pendingLoaded: false,
  allLoaded: false,
  pendingError: false,
  allError: false,
  pendingAppendError: false,
  allAppendError: false,
  unauthorized: false,
}

export const useAiActivityStore = create<AiActivityState>()(() => INITIAL_STATE)
const inFlight = new Map<ChangesetListStatus, Promise<void>>()
const PAGE_SIZE = 20

function listSnapshot(status: ChangesetListStatus): ActivityListSnapshot<AiChangeset> {
  const state = useAiActivityStore.getState()
  return status === "pending"
    ? {
        items: state.pendingChangesets,
        cursor: state.pendingCursor,
        hasMore: state.pendingHasMore,
        loading: state.pendingLoading,
        loaded: state.pendingLoaded,
        error: state.pendingError ? (state.pendingAppendError ? "append" : "refresh") : null,
      }
    : {
        items: state.allChangesets,
        cursor: state.allCursor,
        hasMore: state.allHasMore,
        loading: state.allLoading,
        loaded: state.allLoaded,
        error: state.allError ? (state.allAppendError ? "append" : "refresh") : null,
      }
}

function setListSnapshot(status: ChangesetListStatus, snapshot: ActivityListSnapshot<AiChangeset>) {
  const error = snapshot.error !== null
  const appendError = snapshot.error === "append"
  useAiActivityStore.setState(status === "pending"
    ? {
        pendingChangesets: snapshot.items,
        pendingCursor: snapshot.cursor,
        pendingHasMore: snapshot.hasMore,
        pendingLoading: snapshot.loading,
        pendingLoaded: snapshot.loaded,
        pendingError: error,
        pendingAppendError: appendError,
      }
    : {
        allChangesets: snapshot.items,
        allCursor: snapshot.cursor,
        allHasMore: snapshot.hasMore,
        allLoading: snapshot.loading,
        allLoaded: snapshot.loaded,
        allError: error,
        allAppendError: appendError,
      })
}

function handleUnauthorized(cause: unknown) {
  if (!(cause instanceof ApiFailure) || cause.kind !== "unauthorized") return false
  useAiActivityStore.setState({ unauthorized: true })
  void syncNow()
  return true
}

export function refreshChangesets(status: ChangesetListStatus, append = false): Promise<void> {
  const state = useAiActivityStore.getState()
  if (state.unauthorized) return Promise.resolve()
  const existingRequest = inFlight.get(status)
  if (existingRequest) return existingRequest
  const current = listSnapshot(status)
  if (append && (!current.hasMore || current.cursor === null)) return Promise.resolve()

  setListSnapshot(status, beginActivityListRequest(current))
  const request = (async () => {
    try {
      const result = await listChangesets({ status, cursor: append ? current.cursor ?? undefined : undefined, limit: PAGE_SIZE })
      const latest = listSnapshot(status)
      const page = { items: result.changesets, nextCursor: result.nextCursor }
      setListSnapshot(status, append
        ? receiveActivityNextPage(latest, page)
        : receiveActivityFirstPage(latest, page, status === "all"))
      useAiActivityStore.setState({ pendingCount: result.pendingCount })
    } catch (cause) {
      if (!handleUnauthorized(cause)) {
        setListSnapshot(status, failActivityListRequest(listSnapshot(status), append))
      }
    } finally {
      inFlight.delete(status)
      const latest = listSnapshot(status)
      if (latest.loading) setListSnapshot(status, { ...latest, loading: false })
    }
  })()
  inFlight.set(status, request)
  return request
}

async function refreshLatest(status: ChangesetListStatus): Promise<void> {
  await inFlight.get(status)
  await refreshChangesets(status)
}

export async function openAiActivity(tab?: ActivityTab): Promise<void> {
  useAiActivityStore.setState({ drawerOpen: true, tab: tab ?? "pending" })
  const status = tab ?? "pending"
  await refreshChangesets(status)
  const state = useAiActivityStore.getState()
  if (!tab && !state.pendingError && state.pendingCount === 0) {
    useAiActivityStore.setState({ tab: "all" })
    await refreshChangesets("all")
  }
}

export function setActivityDrawerOpen(open: boolean) {
  useAiActivityStore.setState({ drawerOpen: open })
}

export function setActivityTab(tab: ActivityTab) {
  useAiActivityStore.setState({ tab })
  void refreshChangesets(tab)
}

export async function loadMoreChangesets(status: ChangesetListStatus) {
  await refreshChangesets(status, true)
}

export async function performChangesetAction(
  action: ActivityAction,
  id: string,
  seqs?: number[]
): Promise<ChangesetActionResponse> {
  try {
    const result = action === "accept"
      ? await acceptChangeset(id)
      : action === "reject"
        ? await rejectChangeset(id)
        : await undoChangeset(id, seqs)
    if (action !== "reject") await syncNow()
    const tab = useAiActivityStore.getState().tab
    await Promise.all([refreshLatest("pending"), tab === "all" ? refreshLatest("all") : Promise.resolve()])
    return result
  } catch (cause) {
    handleUnauthorized(cause)
    if (shouldRefreshAfterActionFailure(action)) {
      const tab = useAiActivityStore.getState().tab
      void Promise.all([refreshLatest("pending"), tab === "all" ? refreshLatest("all") : Promise.resolve()])
    }
    throw cause
  }
}

/** Owns cloud-only refresh scheduling; list reads are independent from sync-state changes. */
export function useAiActivity(enabled: boolean) {
  const unauthorized = useAiActivityStore((state) => state.unauthorized)

  useEffect(() => {
    if (!enabled) return
    const recover = (status: ReturnType<typeof useSync.getState>["status"]) => {
      if (shouldRecoverActivityAuthorization(useAiActivityStore.getState().unauthorized, status)) {
        useAiActivityStore.setState({ unauthorized: false })
      }
    }
    recover(useSync.getState().status)
    return useSync.subscribe((state) => recover(state.status))
  }, [enabled])

  useEffect(() => {
    if (!shouldScheduleActivityRefresh(enabled, unauthorized)) return

    const refreshVisible = () => {
      if (document.visibilityState !== "visible") return
      const state = useAiActivityStore.getState()
      void refreshChangesets("pending")
      if (state.drawerOpen && state.tab === "all") void refreshChangesets("all")
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshVisible()
    }
    window.addEventListener("focus", refreshVisible)
    document.addEventListener("visibilitychange", onVisible)
    const timer = window.setInterval(refreshVisible, 60_000)
    refreshVisible()

    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refreshVisible)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [enabled, unauthorized])
}
