"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import {
  IconArrowRight,
  IconCalendarWeek,
  IconCircleDashed,
  IconDevices,
  IconLayoutKanban,
  IconListCheck,
  IconReceipt,
  IconRepeat,
  IconShieldLock,
  IconSparkles,
  IconTargetArrow,
} from "@tabler/icons-react"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { SCENARIO_AMBIENT, SCENARIO_INTERVAL_MS } from "@/content/home"
import { APP_URL } from "@/content/site"
import { cn } from "@/lib/cn"
import { usePrefersReducedMotion } from "@/lib/motion"
import { buttonClass, CARD_FLOAT, SECTION_SUBTITLE, SECTION_TITLE } from "@/lib/styles"

/** 十个问题各自对应的图标，顺序和词条里的问题一一对应：副业看板、今天的任务、收支、容量、回顾、例行、新副业构思、多设备、自己部署、月目标 */
const SCENARIO_ICONS = [
  IconLayoutKanban,
  IconListCheck,
  IconReceipt,
  IconCalendarWeek,
  IconSparkles,
  IconRepeat,
  IconCircleDashed,
  IconDevices,
  IconShieldLock,
  IconTargetArrow,
] as const

function ScenarioHeading({ locale }: { locale: Locale }) {
  const t = getMessages(locale)

  return (
    <>
      <h2 className={SECTION_TITLE}>{t.home.scenarios.title}</h2>
      <p className={SECTION_SUBTITLE}>{t.home.scenarios.subtitle}</p>
      <a href={APP_URL} data-cta="scenarios-try" className={buttonClass("primary", "md", "mt-8")}>
        {t.common.tryDemo}
        <IconArrowRight size={18} stroke={1.75} aria-hidden />
      </a>
    </>
  )
}

export function ScenariosSection({ locale }: { locale: Locale }) {
  const t = getMessages(locale)
  const cards = t.home.scenarios.cards
  const reduce = usePrefersReducedMotion()
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [restartToken, setRestartToken] = useState(0)
  const ActiveIcon = SCENARIO_ICONS[active] ?? IconLayoutKanban

  // 单次定时器在切换、悬停和移出时重新计时，减少动态效果时不创建定时器。
  useEffect(() => {
    if (reduce || paused) return
    const timeout = window.setTimeout(() => {
      setActive((current) => (current + 1) % cards.length)
    }, SCENARIO_INTERVAL_MS)
    return () => window.clearTimeout(timeout)
  }, [active, cards.length, paused, reduce, restartToken])

  const selectScenario = (index: number) => {
    setActive(index)
    setRestartToken((current) => current + 1)
  }

  const activeCard = cards[active]

  return (
    <section id="scenarios" className="relative overflow-hidden bg-neutral-50">
      <div aria-hidden className="bg-dots mask-radial absolute inset-0" />

      <div className="relative mx-auto hidden h-[900px] max-w-7xl md:block">
        {SCENARIO_AMBIENT.map((slot) => {
          const card = cards[slot.card]
          if (!card) return null
          return (
            <div
              key={slot.card}
              aria-hidden
              className={cn(CARD_FLOAT, "absolute transition-opacity duration-500", slot.card === active ? "opacity-0" : "opacity-[0.14]")}
              style={{ top: `${slot.top}%`, left: `${slot.left}%`, width: slot.width }}
            >
              <p className="text-base leading-snug font-semibold text-neutral-800">“{card.q}”</p>
              <p className="mt-3 text-sm leading-relaxed text-neutral-500">{card.a}</p>
            </div>
          )
        })}

        <div
          className="absolute top-[5%] left-1/2 w-[400px] -translate-x-1/2"
          aria-live="polite"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {activeCard ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.figure
                key={active}
                data-scenario-active={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                className={cn(CARD_FLOAT, "p-6")}
              >
                <blockquote className="text-lg leading-snug font-semibold text-neutral-800">“{activeCard.q}”</blockquote>
                <figcaption className="mt-4 flex items-center gap-2.5 text-sm text-neutral-600">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-deep">
                    <ActiveIcon size={16} stroke={1.75} aria-hidden />
                  </span>
                  {activeCard.a}
                </figcaption>
              </motion.figure>
            </AnimatePresence>
          ) : null}
          <div className="mt-4 flex justify-center gap-1.5">
            {cards.map((_, index) => (
              <button
                key={index}
                type="button"
                data-scenario-dot={index}
                aria-label={`${index + 1} / ${cards.length}`}
                aria-current={index === active ? "true" : undefined}
                onClick={() => selectScenario(index)}
                className={cn(
                  "size-1.5 rounded-full",
                  index === active ? "bg-neutral-800" : "bg-neutral-300 hover:bg-neutral-500",
                )}
              />
            ))}
          </div>
        </div>

        <div className="absolute inset-x-0 top-[46%] mx-auto max-w-xl px-4 text-center">
          <ScenarioHeading locale={locale} />
        </div>
      </div>

      <div className="relative px-4 py-16 md:hidden">
        <div className="mx-auto max-w-xl text-center">
          <ScenarioHeading locale={locale} />
        </div>
        <div className="mx-auto mt-10 max-w-xl space-y-4">
          {cards.slice(0, 3).map((card, index) => {
            const Icon = SCENARIO_ICONS[index] ?? IconLayoutKanban
            return (
              <figure key={index} className={cn(CARD_FLOAT, "p-6")}>
                <blockquote className="text-lg leading-snug font-semibold text-neutral-800">“{card.q}”</blockquote>
                <figcaption className="mt-4 flex items-center gap-2.5 text-sm text-neutral-600">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-deep">
                    <Icon size={16} stroke={1.75} aria-hidden />
                  </span>
                  {card.a}
                </figcaption>
              </figure>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default ScenariosSection
