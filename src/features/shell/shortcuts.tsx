"use client"

import { useRouter } from "next/navigation"
import { Fragment, useEffect, useRef } from "react"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { isTypingTarget, useIsMac } from "@/lib/platform"
import { usePrefs } from "@/state/prefs"
import { useUi } from "@/state/ui"

const GO_WINDOW_MS = 900

export interface ShortcutConfig {
  /** 先按 G 再按这个键，跳到对应页面 */
  go: Record<string, string>
  /** 单键动作，比如 C 新建 */
  keys: Record<string, () => void>
  /** 快捷键说明里列出的条目（通用的几条会自动加上） */
  help: { label: string; keys: string[] }[]
}

/** 单键快捷键：输入框里、浮层打开时都不响应 */
export function GlobalShortcuts({ config }: { config: ShortcutConfig }) {
  const router = useRouter()
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    let goPressedAt = 0

    const onKeyDown = (event: KeyboardEvent) => {
      const ui = useUi.getState()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        ui.setCommandOpen(!ui.commandOpen)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
      if (isTypingTarget(event.target)) return
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return

      const { go, keys } = configRef.current
      const key = event.key.toLowerCase()
      if (Date.now() - goPressedAt < GO_WINDOW_MS && go[key]) {
        goPressedAt = 0
        event.preventDefault()
        router.push(go[key])
        return
      }
      if (key === "g") {
        goPressedAt = Date.now()
        return
      }
      if (event.key === "/") {
        event.preventDefault()
        ui.setCommandOpen(true)
        return
      }
      if (event.key === "?") {
        ui.setShortcutsOpen(true)
        return
      }
      if (event.key === "[") {
        const prefs = usePrefs.getState()
        prefs.setSidebarCollapsed(!prefs.sidebarCollapsed)
        return
      }
      const action = keys[key]
      if (action) {
        event.preventDefault()
        action()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [router])

  return null
}

export function ShortcutsDialog({ rows }: { rows: { label: string; keys: string[] }[] }) {
  const open = useUi((state) => state.shortcutsOpen)
  const setOpen = useUi((state) => state.setShortcutsOpen)
  const isMac = useIsMac()
  const mod = isMac ? "⌘" : "Ctrl"

  const all = [
    { label: "搜索", keys: [mod, "K"] },
    ...rows,
    { label: "收起或展开侧栏", keys: ["["] },
    { label: "查看快捷键", keys: ["?"] },
  ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-3 sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>键盘快捷键</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[1fr_auto] gap-y-2">
          {all.map((row) => (
            <Fragment key={row.label}>
              <dt className="text-sm text-fg-2">{row.label}</dt>
              <dd>
                <KbdGroup>
                  {row.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </KbdGroup>
              </dd>
            </Fragment>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
