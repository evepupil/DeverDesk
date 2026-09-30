"use client"

// 改自 Aceternity UI 的 Timeline 组件。
import { useEffect, useRef, useState } from "react"
import { motion, useScroll, useTransform } from "motion/react"
import { cn } from "@/lib/cn"
import { usePrefersReducedMotion } from "@/lib/motion"

export interface TimelineEntry {
  id: string
  title: React.ReactNode
  aside?: React.ReactNode
  content: React.ReactNode
}

export const Timeline = ({ data, className }: { data: TimelineEntry[]; className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const reducedMotion = usePrefersReducedMotion()
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start 10%", "end 50%"] })
  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height])
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1])

  useEffect(() => {
    const element = contentRef.current
    if (!element) return
    const update = () => setHeight(element.getBoundingClientRect().height)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={cn("w-full", className)} ref={containerRef}>
      <div ref={contentRef} className="relative mx-auto max-w-7xl pb-20">
        <div className="absolute top-0 left-8 h-full w-[2px] overflow-hidden bg-linear-to-b from-transparent via-neutral-200 to-transparent md:left-8">
          <motion.div
            className="absolute top-0 left-0 w-[2px] origin-top bg-linear-to-t from-brand-primary via-brand-secondary to-transparent"
            style={reducedMotion ? { height, opacity: 1 } : { height: heightTransform, opacity: opacityTransform }}
          />
        </div>
        {data.map((item) => (
          <div key={item.id} id={item.id} data-release={item.id} className="flex justify-start pt-10 md:gap-10 md:pt-32">
            <div className="sticky top-32 z-40 flex max-w-xs flex-col self-start md:w-full lg:max-w-sm">
              <div className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-white">
                <div className="h-4 w-4 rounded-full border border-neutral-300 bg-neutral-200" />
              </div>
              <h3 className="hidden text-xl font-bold text-neutral-500 md:block md:pl-20 md:text-5xl">{item.title}</h3>
              {item.aside ? <div className="hidden md:block md:pl-20 md:pt-2">{item.aside}</div> : null}
            </div>
            <div className="relative w-full pr-4 pl-20 md:pl-4">
              <h3 className="mb-1 block text-left text-2xl font-bold text-neutral-500 md:hidden">{item.title}</h3>
              {item.aside ? <div className="mb-4 md:hidden">{item.aside}</div> : null}
              {item.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Timeline
