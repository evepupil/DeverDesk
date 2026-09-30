"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { IconBolt, IconCalendarEvent, IconClock, IconPlus } from "@tabler/icons-react"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"
import { usePrefersReducedMotion } from "@/lib/motion"

export function FeaturesQuickAddArt({ locale }: { locale: Locale }) {
  const quickAdd = getMessages(locale).home.features.quickAdd
  const reduce = usePrefersReducedMotion()
  const [count, setCount] = useState(quickAdd.input.length)
  const parts = quickAdd.input.split(" ")
  const chipEndIndices = quickAdd.chips.map((_, index) => {
    const segmentIndex = parts.length - quickAdd.chips.length + index
    return parts.slice(0, segmentIndex + 1).join(" ").length
  })
  const shown = reduce ? quickAdd.input.length : count

  useEffect(() => {
    if (reduce) return

    let timer = 0
    const typeNext = (next: number) => {
      timer = window.setTimeout(() => {
        setCount(next)
        if (next < quickAdd.input.length) {
          typeNext(next + 1)
        } else {
          timer = window.setTimeout(clearAndType, 2500)
        }
      }, 55)
    }
    const clearAndType = () => {
      setCount(0)
      typeNext(1)
    }

    // 服务端先渲染完整输入内容；循环只在挂载后启动，并在卸载时清理当前计时器。
    timer = window.setTimeout(clearAndType, 2500)
    return () => window.clearTimeout(timer)
  }, [quickAdd.input, reduce])

  return (
    <>
      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/10">
        <IconPlus size={16} stroke={1.75} className="shrink-0 text-neutral-400" aria-hidden="true" />
        <span className="min-w-0 truncate text-[13px] text-neutral-900">{quickAdd.input.slice(0, shown)}</span>
        <span className="animate-caret h-4 w-px shrink-0 bg-neutral-900" />
      </div>

      <div className="mt-3 flex min-h-[28px] flex-wrap gap-1.5">
        {quickAdd.chips.map((chip, index) => {
          const visible = shown >= (chipEndIndices[index] ?? quickAdd.input.length)
          const icon = index === 0 ? (
            <IconClock size={12} aria-hidden="true" />
          ) : index === 1 ? (
            <span className="size-2 rounded-[2px] bg-label-teal" aria-hidden="true" />
          ) : index === 2 ? (
            <IconCalendarEvent size={12} aria-hidden="true" />
          ) : (
            <IconBolt size={12} className="text-dd-risk" aria-hidden="true" />
          )

          return (
            <motion.span
              key={chip}
              initial={false}
              animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.9 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
              className={cn(
                "inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-[12px] font-medium text-neutral-700",
                !visible && "invisible",
              )}
            >
              {icon}
              {chip}
            </motion.span>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-neutral-500">
        <kbd className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 font-sans text-[10px] text-neutral-600">↵</kbd>
        {quickAdd.hint}
      </div>
    </>
  )
}

export default FeaturesQuickAddArt
