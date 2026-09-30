"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { IconCheck, IconChevronDown, IconWorld } from "@tabler/icons-react"
import { getMessages } from "@/i18n"
import { HTML_LANG, LOCALE_NAMES, LOCALES, LOCALE_STORAGE_KEY, swapLocale, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"
import { usePrefersReducedMotion } from "@/lib/motion"

type LocaleSwitchProps = {
  locale: Locale
  /** 菜单往下展开（顶栏）还是往上展开（页脚） */
  direction?: "down" | "up"
  /** 菜单和按钮右对齐还是左对齐 */
  align?: "left" | "right"
  className?: string
}

/**
 * 语言切换：经典下拉。按钮上是地球图标 + 当前语言 + 小箭头，点开列出全部语言，当前的打勾。
 * 选项是普通链接（换到另一种语言的同一页），点击时把选择记在浏览器里，下次打开根地址直接用它。
 * 键盘：按钮上 ↓ 打开并聚焦当前语言；菜单里 ↑ ↓ Home End 移动，Esc 关闭并回到按钮；点菜单外面也会关闭。
 */
export function LocaleSwitch({ locale, direction = "down", align = "right", className }: LocaleSwitchProps) {
  const t = getMessages(locale)
  const pathname = usePathname() ?? "/"
  const reduce = usePrefersReducedMotion()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const menuId = useId()

  // 打开时把焦点放到当前语言上；点菜单外面、按 Esc 都会关闭
  useEffect(() => {
    if (!open) return
    itemRefs.current[LOCALES.indexOf(locale)]?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, locale])

  function onButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = itemRefs.current.filter((item): item is HTMLAnchorElement => item !== null)
    const current = items.indexOf(document.activeElement as HTMLAnchorElement)
    let next = current
    if (event.key === "ArrowDown") next = (current + 1) % items.length
    else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = items.length - 1
    else if (event.key === "Tab") {
      setOpen(false)
      return
    } else return
    event.preventDefault()
    items[next]?.focus()
  }

  const offset = direction === "down" ? -4 : 4

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        data-locale-toggle
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t.nav.language}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKeyDown}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-2.5 text-sm font-medium text-neutral-600 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
      >
        <IconWorld size={16} stroke={1.75} aria-hidden />
        <span>{LOCALE_NAMES[locale]}</span>
        <IconChevronDown size={14} stroke={1.75} aria-hidden className={cn("transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="locale-menu"
            id={menuId}
            role="menu"
            aria-label={t.nav.language}
            data-locale-menu
            onKeyDown={onMenuKeyDown}
            initial={reduce ? false : { opacity: 0, y: offset, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: offset, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute z-50 min-w-40 rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/5",
              direction === "down" ? "top-full mt-2 origin-top" : "bottom-full mb-2 origin-bottom",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            {LOCALES.map((target, index) => {
              const selected = target === locale
              return (
                <a
                  key={target}
                  ref={(element) => {
                    itemRefs.current[index] = element
                  }}
                  role="menuitemradio"
                  aria-checked={selected}
                  href={swapLocale(pathname, target)}
                  lang={HTML_LANG[target]}
                  hrefLang={HTML_LANG[target]}
                  data-locale={target}
                  onClick={(event) => {
                    // 选的就是当前语言：只收起菜单，不重新加载
                    if (selected) {
                      event.preventDefault()
                      setOpen(false)
                      buttonRef.current?.focus()
                      return
                    }
                    try {
                      localStorage.setItem(LOCALE_STORAGE_KEY, target)
                    } catch {}
                  }}
                  className={cn(
                    "flex items-center justify-between gap-6 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:bg-neutral-100",
                    selected ? "font-medium text-neutral-900" : "text-neutral-600",
                  )}
                >
                  <span>{LOCALE_NAMES[target]}</span>
                  {selected ? <IconCheck size={16} stroke={2} aria-hidden className="text-brand-deep" /> : null}
                </a>
              )
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
