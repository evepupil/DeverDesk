"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react"
import { IconBrandGithub, IconMenu2, IconX } from "@tabler/icons-react"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { APP_URL, REPO_URL } from "@/content/site"
import { cn } from "@/lib/cn"
import { usePrefersReducedMotion } from "@/lib/motion"
import { buttonClass, NAV_LINK } from "@/lib/styles"
import { localePath } from "@/i18n/locales"
import { GithubButton } from "./github-button"
import { LocaleSwitch } from "./locale-switch"
import { LogoMark } from "./logo"
import { NewTabHint } from "./external-mark"
import type { NavKey } from "./site-header"

type SiteNavbarProps = {
  locale: Locale
  current: NavKey
  stars: number | null
}

type NavMode = "top" | "floating" | "hidden"

export function SiteNavbar({ locale, current, stars }: SiteNavbarProps) {
  const t = getMessages(locale)
  const [mode, setMode] = useState<NavMode>("top")
  const [menuOpen, setMenuOpen] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const { scrollY } = useScroll()
  const shown = menuOpen ? "floating" : mode

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0
    if (y < 20) setMode("top")
    else if (y > prev && y > 120 && !menuOpen) setMode("hidden")
    else if (y < prev) setMode("floating")
  })

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    const media = window.matchMedia("(min-width: 1024px)")
    const onMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    media.addEventListener("change", onMediaChange)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      media.removeEventListener("change", onMediaChange)
    }
  }, [menuOpen])

  const navItems = [
    { key: "features", href: localePath(locale, "/#features"), label: t.nav.features },
    { key: "open-source", href: localePath(locale, "/#open-source"), label: t.nav.openSource },
    { key: "blog", href: localePath(locale, "/blog/"), label: t.nav.blog },
    { key: "changelog", href: localePath(locale, "/changelog/"), label: t.nav.changelog },
  ] as const

  const isCurrent = (key: (typeof navItems)[number]["key"]) =>
    (key === "blog" && current === "blog") || (key === "changelog" && current === "changelog")

  return (
    <header
      data-nav-state={shown}
      className={cn("fixed inset-x-0 top-0 z-50 transition-transform duration-300 ease-out", shown === "hidden" ? "-translate-y-[110%]" : "translate-y-0")}
    >
      <nav
        aria-label={t.nav.aria}
        className={cn("mx-auto w-full max-w-7xl transition-[padding] duration-300", shown === "top" ? "px-0 pt-0" : "px-2 pt-2 md:px-4")}
      >
        <div
          className={cn(
            "flex h-14 items-center justify-between px-4 transition-[background-color,box-shadow,border-radius] duration-300 sm:h-16 md:px-8",
            shown === "top" ? "rounded-none bg-transparent" : "rounded-3xl bg-white/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)] backdrop-blur-md",
          )}
        >
          <a href={localePath(locale)} aria-label={t.nav.home} className="flex items-center gap-2">
            <LogoMark className="size-6" />
            <span className="text-base font-semibold tracking-tight text-neutral-900">DeverDesk</span>
          </a>

          <ul className="hidden items-center gap-8 lg:flex">
            {navItems.map((item) => (
              <li key={item.key}>
                <a
                  href={item.href}
                  data-nav-link={item.key}
                  aria-current={isCurrent(item.key) ? "page" : undefined}
                  className={cn(NAV_LINK, isCurrent(item.key) && "text-neutral-900")}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-3 lg:flex">
            <LocaleSwitch locale={locale} />
            <GithubButton locale={locale} stars={stars} size="sm" />
            <a href={APP_URL} data-cta="try" className={buttonClass("primary", "sm")}>
              {t.common.tryDemo}
            </a>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <GithubButton locale={locale} stars={stars} size="sm" className="px-3" />
            <button
              type="button"
              data-nav-toggle
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? t.nav.closeMenu : t.nav.openMenu}
              className="flex size-10 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <IconX size={20} stroke={1.75} aria-hidden /> : <IconMenu2 size={20} stroke={1.75} aria-hidden />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen ? (
            <motion.div
              key="mobile-menu"
              id="mobile-menu"
              data-nav-menu
              initial={reducedMotion ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="mt-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-black/5 lg:hidden"
            >
              {navItems.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  data-nav-link={item.key}
                  aria-current={isCurrent(item.key) ? "page" : undefined}
                  className="block rounded-xl px-4 py-3.5 text-base font-medium text-neutral-900 transition-colors hover:bg-neutral-100"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <div className="my-2 h-px bg-neutral-100" />
              <div className="px-2 py-2">
                <LocaleSwitch locale={locale} align="left" />
              </div>
              <div className="mt-2 grid gap-2 p-2">
                <a
                  href={APP_URL}
                  data-cta="try"
                  className={buttonClass("primary", "md", "w-full")}
                  onClick={() => setMenuOpen(false)}
                >
                  {t.common.tryDemo}
                </a>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass("secondary", "md", "w-full")}
                  onClick={() => setMenuOpen(false)}
                >
                  <IconBrandGithub size={16} stroke={1.75} aria-hidden />
                  {t.common.viewOnGithub}
                  <NewTabHint locale={locale} />
                </a>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </nav>
    </header>
  )
}
