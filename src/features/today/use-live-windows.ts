"use client"

import { useEffect, useMemo, useState } from "react"

import { ApiFailure } from "@/lib/api"
import { getLiveWindows } from "@/lib/recorder-api"
import type { LiveResponse } from "@/sync/recorder-protocol"
import { syncNow, useSync } from "@/state/sync"
import { toLiveWindowRows, type LiveWindowRow } from "./live-windows"

/** Refreshes the recorder's live snapshot only while the online page is visible. */
export function useLiveWindows(enabled: boolean): LiveWindowRow[] {
  const [response, setResponse] = useState<LiveResponse | null>(null)
  const [now, setNow] = useState(0)
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 30_000)
    window.addEventListener("focus", tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", tick)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || unauthorized) return
    let active = true
    let inFlight = false

    const refresh = async () => {
      if (!active || document.visibilityState !== "visible" || inFlight) return
      inFlight = true
      try {
        const next = await getLiveWindows()
        if (active) {
          setResponse(next)
          setNow(Date.now())
        }
      } catch (cause) {
        if (active && cause instanceof ApiFailure && cause.kind === "unauthorized") {
          setUnauthorized(true)
          void syncNow()
        }
      } finally {
        inFlight = false
      }
    }

    const onFocus = () => void refresh()
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)
    const timer = window.setInterval(() => void refresh(), 30_000)
    void refresh()

    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [enabled, unauthorized])

  useEffect(() => {
    if (!enabled || !unauthorized) return
    let sawUnauthorized = useSync.getState().status === "unauthorized"
    const recover = (status: ReturnType<typeof useSync.getState>["status"]) => {
      if (status === "unauthorized") sawUnauthorized = true
      else if (sawUnauthorized && status === "synced") setUnauthorized(false)
    }
    return useSync.subscribe((state) => recover(state.status))
  }, [enabled, unauthorized])

  return useMemo(
    () => enabled && response ? toLiveWindowRows(response, now) : [],
    [enabled, response, now]
  )
}
