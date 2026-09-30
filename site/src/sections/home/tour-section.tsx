"use client"

/**
 * H5 产品导览：八个页签切换产品真实截图（WAI-ARIA tabs）。
 * 受控状态 active，点页签或用键盘 ← → 循环切换（焦点跟着走），Home / End 直达首尾；
 * 切换只淡入淡出面板里的截图，页面不滚动（阻止 Home / End 的默认滚动）。
 */

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { IconArrowRight, IconCheck } from "@tabler/icons-react"
import { BrowserFrame } from "@/components/site/browser-frame"
import { Screenshot } from "@/components/site/screenshot"
import { SectionHeading } from "@/components/site/section-heading"
import { TOUR_KEYS, type TourKey } from "@/content/home"
import { APP_URL } from "@/content/site"
import { fill, getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"
import { usePrefersReducedMotion } from "@/lib/motion"
import { buttonClass, CONTAINER, SECTION_Y } from "@/lib/styles"

/** 页签选中 / 未选中的完整类名，对象映射，不拼模板字符串 */
const TAB_STATE_CLASSES = {
  active: "shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white",
  idle: "shrink-0 rounded-full px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900",
} as const

export function TourSection({ locale }: { locale: Locale }) {
  const t = getMessages(locale)
  const [active, setActive] = useState<TourKey>("today")
  const reduce = usePrefersReducedMotion()
  /** 页签元素的引用，键盘切换后把焦点移到新页签上 */
  const tabRefs = useRef<Partial<Record<TourKey, HTMLButtonElement | null>>>({})
  const item = t.home.tour.items[active]

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const total = TOUR_KEYS.length
    const current = TOUR_KEYS.indexOf(active)
    let next: number
    if (event.key === "ArrowRight") next = (current + 1) % total
    else if (event.key === "ArrowLeft") next = (current - 1 + total) % total
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = total - 1
    else return
    // 阻止 Home / End 把整页滚到顶 / 底；选中即切换，焦点同时落到新页签
    event.preventDefault()
    const nextKey = TOUR_KEYS[next]
    setActive(nextKey)
    tabRefs.current[nextKey]?.focus()
  }

  return (
    <section id="tour" className="bg-neutral-50">
      <div className={cn(CONTAINER, SECTION_Y)}>
        <SectionHeading align="center" title={t.home.tour.title} subtitle={t.home.tour.subtitle} />
        <div
          role="tablist"
          aria-label={t.home.tour.tablist}
          className="no-scrollbar mx-auto mt-10 flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-sm ring-1 ring-black/5 md:mt-12 md:w-fit"
        >
          {TOUR_KEYS.map((key) => (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el
              }}
              type="button"
              role="tab"
              id={`tour-tab-${key}`}
              aria-selected={key === active}
              aria-controls="tour-panel"
              tabIndex={key === active ? 0 : -1}
              data-tour-tab={key}
              onClick={() => setActive(key)}
              onKeyDown={handleTabKeyDown}
              className={TAB_STATE_CLASSES[key === active ? "active" : "idle"]}
            >
              {t.home.tour.items[key].label}
            </button>
          ))}
        </div>
        <div
          id="tour-panel"
          role="tabpanel"
          aria-labelledby={`tour-tab-${active}`}
          data-tour-panel={active}
          className="mt-10 grid items-center gap-8 lg:grid-cols-12 lg:gap-12"
        >
          <div className="lg:col-span-4">
            <h3 className="text-2xl tracking-tight text-neutral-800 md:text-3xl">{item.title}</h3>
            <ul className="mt-6 space-y-3">
              {item.points.map((point, index) => (
                <li key={index} className="flex gap-3 text-sm text-neutral-600 md:text-base">
                  <IconCheck size={18} stroke={2} aria-hidden className="mt-0.5 shrink-0 text-brand-deep" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <a href={APP_URL} data-cta="tour-try" className={buttonClass("secondary", "sm", "mt-8")}>
              {t.common.tryDemo}
              <IconArrowRight size={16} stroke={1.75} aria-hidden />
            </a>
          </div>
          <div className="min-w-0 lg:col-span-8">
            <BrowserFrame url={t.home.hero.frameUrl} bodyClassName="bg-neutral-50">
              {/* initial={false}：首次挂载不播动画，服务端渲染出来的就是第一张完整截图 */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.25 }}
                >
                  <Screenshot name={active} locale={locale} alt={fill(t.home.tour.shotAlt, { label: item.label })} />
                </motion.div>
              </AnimatePresence>
            </BrowserFrame>
          </div>
        </div>
      </div>
    </section>
  )
}

export default TourSection
