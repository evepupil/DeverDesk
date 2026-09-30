"use client"

import { motion } from "motion/react"
import { IconCircleCheckFilled, IconCircleDashed, IconSparkles } from "@tabler/icons-react"
import { formatDuration } from "@/content/format"
import { TODAY_TIMELINE } from "@/content/home"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"
import { usePrefersReducedMotion } from "@/lib/motion"

const BLOCK_COLOR_CLASSES: Record<(typeof TODAY_TIMELINE.blocks)[number]["color"], string> = {
  teal: "bg-label-teal",
  gray: "bg-label-gray",
  indigo: "bg-label-indigo",
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

export function FeaturesTodayArt({ locale }: { locale: Locale }) {
  const t = getMessages(locale)
  const today = t.home.features.today
  const reduce = usePrefersReducedMotion()
  const timeline = TODAY_TIMELINE
  const hourTicks = Array.from(
    { length: timeline.endHour - timeline.startHour + 1 },
    (_, index) => timeline.startHour + index,
  )
  const halfHourTicks = Array.from(
    { length: Math.max(timeline.endHour - timeline.startHour - 1, 0) },
    (_, index) => timeline.startHour + index + 1,
  )
  const nowTop = (timeline.now - timeline.startHour) * 56
  const dropTop = (timeline.drop.start - timeline.startHour) * 56 + 2
  const dropHeight = timeline.drop.hours * 56 - 4

  return (
    <>
      <div className="relative mx-auto w-full max-w-[360px] rounded-xl border border-dashed border-neutral-300 p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-neutral-500">
            {hourLabel(timeline.startHour)} – {hourLabel(timeline.endHour)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[12px] font-medium text-neutral-700 shadow-sm ring-1 ring-neutral-200">
            <IconSparkles size={12} stroke={1.75} aria-hidden="true" />
            {today.autoSchedule}
          </span>
        </div>

        <div className="relative mt-3 h-[224px]">
          {hourTicks.map((hour) => (
            <div
              key={hour}
              className="absolute right-0 left-0 flex items-center"
              style={{ top: `${(hour - timeline.startHour) * 56}px` }}
            >
              <span className="w-9 font-mono text-[10px] text-neutral-500">{hourLabel(hour)}</span>
              <span className="ml-10 flex-1 border-t border-neutral-200" />
            </div>
          ))}

          {halfHourTicks.map((hour) => (
            <div
              key={hour}
              className="absolute right-0 left-10 border-t border-dashed border-neutral-100"
              style={{ top: `${(hour + 0.5 - timeline.startHour) * 56}px` }}
            />
          ))}

          {timeline.blocks.map((block, index) => {
            const label = today.blocks[index]
            if (!label) return null
            const top = (block.start - timeline.startHour) * 56 + 2
            const height = block.hours * 56 - 4

            return (
              <div
                key={`${block.start}-${label}`}
                className="absolute right-1 left-10 rounded-md border border-neutral-200 bg-white py-1 pr-2 pl-3 text-[12px] font-medium text-neutral-800 shadow-[0_1px_1px_rgba(0,0,0,0.04)]"
                style={{ top: `${top}px`, height: `${height}px` }}
              >
                <span className={cn("absolute inset-y-1 left-1 w-[3px] rounded-full", BLOCK_COLOR_CLASSES[block.color])} />
                <div className="flex h-full min-w-0 flex-col justify-center">
                  <span className="truncate">{label}</span>
                  {height >= 38 ? (
                    <span className="text-[11px] font-normal text-neutral-500">
                      {formatDuration(block.hours * 60)}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}

          <div className="absolute left-8 right-0 z-20" style={{ top: `${nowTop}px` }}>
            <div className="h-px bg-dd-risk" />
            <span className="absolute -top-4 right-0 bg-white px-1 text-[10px] text-dd-risk">{today.now}</span>
            <span className="absolute -top-[3px] -left-0.5 size-[7px] rounded-full bg-dd-risk">
              <span className="absolute inset-0 animate-ping rounded-full bg-dd-risk/50 motion-reduce:hidden" />
            </span>
          </div>

          <div
            className="absolute right-1 left-10 rounded-md border border-dashed border-brand-primary/60 bg-brand-soft/70"
            style={{ top: `${dropTop}px`, height: `${dropHeight}px` }}
          />

          {/* 减少动态效果时保留完整画面，只停掉拖动浮动和红点脉冲。 */}
          <motion.div
            className="absolute right-3 left-14 rotate-[-2deg] rounded-md bg-white px-3 py-2 shadow-lg ring-1 ring-black/5"
            style={{ top: `${dropTop - 8}px` }}
            animate={reduce ? undefined : { y: [0, -6, 0] }}
            transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] font-medium text-neutral-900">{today.dragging}</span>
              <span className="font-mono text-[11px] text-neutral-500">{formatDuration(timeline.drop.hours * 60)}</span>
            </div>
            <svg
              viewBox="0 0 16 16"
              className="absolute -right-2 -bottom-3 size-4 text-neutral-800"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6.5 14.5 2.7 9.2a.9.9 0 0 1 1.4-1.1l2 2.1V3a1 1 0 0 1 2 0v4.6V5.8a1 1 0 0 1 2 0v1.8V6.6a1 1 0 0 1 2 0v1.6V7.5a1 1 0 0 1 2 0v4a3 3 0 0 1-3 3H6.5Z"
                fill="white"
                stroke="currentColor"
                strokeLinejoin="round"
                strokeWidth="1.2"
              />
            </svg>
          </motion.div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="shrink-0 text-[12px] text-neutral-600">{today.capacity}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full w-[92%] rounded-full bg-neutral-700" />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[360px] rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
        {timeline.blocks.map((block, index) => {
          const label = today.blocks[index]
          if (!label) return null

          const icon = index === 0 ? (
            <IconCircleCheckFilled size={16} className="shrink-0 text-dd-done" aria-hidden="true" />
          ) : index === 1 ? (
            <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-dd-progress" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" />
              <path d="M8 1.5A6.5 6.5 0 0 0 8 14.5Z" fill="currentColor" />
            </svg>
          ) : (
            <IconCircleDashed size={16} className="shrink-0 text-neutral-400" aria-hidden="true" />
          )
          const textClass = index === 0 ? "text-neutral-500 line-through" : "text-neutral-800"

          return (
            <div key={`${block.start}-${label}`} className="flex items-center gap-2.5 py-1.5 text-[13px]">
              {icon}
              <span className={textClass}>{label}</span>
              <span className="ml-auto font-mono text-[11px] text-neutral-500">
                {formatDuration(block.hours * 60)}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

export default FeaturesTodayArt
