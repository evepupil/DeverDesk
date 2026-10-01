"use client"

import { Clock3, History, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { Segmented } from "@/components/base/segmented"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useT } from "@/i18n/react"
import { ChangesetCard } from "./changeset-card"
import { groupChangesetsByDay } from "./activity-text"
import { loadMoreChangesets, refreshChangesets, setActivityDrawerOpen, setActivityTab, useAiActivityStore } from "./use-ai-activity"
import { shouldAutoLoadActivityPage } from "./activity-state"

export function ActivityDrawer() {
  const t = useT()
  const rootRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const open = useAiActivityStore((state) => state.drawerOpen)
  const tab = useAiActivityStore((state) => state.tab)
  const pendingCount = useAiActivityStore((state) => state.pendingCount)
  const items = useAiActivityStore((state) => tab === "pending" ? state.pendingChangesets : state.allChangesets)
  const loading = useAiActivityStore((state) => tab === "pending" ? state.pendingLoading : state.allLoading)
  const loaded = useAiActivityStore((state) => tab === "pending" ? state.pendingLoaded : state.allLoaded)
  const error = useAiActivityStore((state) => tab === "pending" ? state.pendingError : state.allError)
  const appendError = useAiActivityStore((state) => tab === "pending" ? state.pendingAppendError : state.allAppendError)
  const hasMore = useAiActivityStore((state) => tab === "pending" ? state.pendingHasMore : state.allHasMore)
  const groups = useMemo(() => groupChangesetsByDay(items), [items])

  useEffect(() => {
    if (!open || !shouldAutoLoadActivityPage(hasMore, loading, error) || !rootRef.current || !endRef.current || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const state = useAiActivityStore.getState()
        const currentError = tab === "pending" ? state.pendingError : state.allError
        const currentLoading = tab === "pending" ? state.pendingLoading : state.allLoading
        const currentHasMore = tab === "pending" ? state.pendingHasMore : state.allHasMore
        if (entry.isIntersecting && shouldAutoLoadActivityPage(currentHasMore, currentLoading, currentError)) {
          void loadMoreChangesets(tab)
        }
      },
      { root: rootRef.current, rootMargin: "100px" }
    )
    observer.observe(endRef.current)
    return () => observer.disconnect()
  }, [error, hasMore, items.length, loading, open, tab])

  const options = [
    { value: "pending" as const, label: `${t.ai.tabs.pending}${pendingCount > 0 ? ` ${pendingCount}` : ""}` },
    { value: "all" as const, label: t.ai.tabs.all },
  ]

  return (
    <Sheet open={open} onOpenChange={setActivityDrawerOpen}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[460px]">
        <SheetHeader className="gap-3 border-b border-line pr-11">
          <SheetTitle>{t.ai.activity}</SheetTitle>
          <Segmented value={tab} options={options} onChange={setActivityTab} label={t.ai.activity} />
          <SheetDescription className="sr-only">{t.ai.activityDescription}</SheetDescription>
        </SheetHeader>
        <div ref={rootRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading && !loaded ? (
            <div className="space-y-2" aria-label={t.ai.loading}>
              <div className="h-24 animate-pulse rounded-md bg-column" />
              <div className="h-24 animate-pulse rounded-md bg-column" />
              <div className="h-24 animate-pulse rounded-md bg-column" />
            </div>
          ) : error && items.length === 0 ? (
            <EmptyState
              icon={RefreshCw}
              title={t.ai.error}
              tone="error"
              action={<Button variant="outline" size="sm" onClick={() => void refreshChangesets(tab)}>{t.ai.retry}</Button>}
              className="min-h-48"
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={tab === "pending" ? Clock3 : History}
              title={tab === "pending" ? t.ai.emptyPending : t.ai.empty}
              className="min-h-48"
            />
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.day} className="space-y-2">
                  <h3 className="sticky top-0 z-10 bg-popover py-1 text-xs font-medium text-fg-2">{group.title}</h3>
                  <div className="space-y-2">
                    {group.changesets.map((changeset) => <ChangesetCard key={changeset.id} changeset={changeset} />)}
                  </div>
                </section>
              ))}
              <div ref={endRef} className="h-px" />
              {loading && <div className="h-16 animate-pulse rounded-md bg-column" />}
              {error && (
                <div role="alert" className="flex flex-wrap items-center justify-center gap-2 py-2 text-xs text-bad">
                  <span>{t.ai.error}</span>
                  <Button variant="ghost" size="sm" onClick={() => void (appendError ? loadMoreChangesets(tab) : refreshChangesets(tab))}>
                    {t.ai.retry}
                  </Button>
                </div>
              )}
              {!error && hasMore && !loading && (
                <div className="flex justify-center">
                  <Button variant="ghost" size="sm" onClick={() => void loadMoreChangesets(tab)} className="text-fg-2">
                    {t.ai.loadMore}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
