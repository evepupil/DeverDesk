"use client"

// 改自 Aceternity UI 的 World Map 组件。
import { useId, useMemo } from "react"
import { motion } from "motion/react"
import DottedMap from "dotted-map"
import { cn } from "@/lib/cn"
import { usePrefersReducedMotion } from "@/lib/motion"

type Coordinate = {
  lat: number
  lng: number
}

type MapDot = {
  start: Coordinate
  end: Coordinate
}

type WorldMapProps = {
  dots?: MapDot[]
  lineColor?: string
  alt: string
  className?: string
}

const EMPTY_DOTS: MapDot[] = []

function projectPoint({ lat, lng }: Coordinate, width: number, height: number) {
  const x = (lng + 180) * (width / 360)
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const y = height / 2 - (width * mercN) / (2 * Math.PI)
  return { x, y }
}

function createCurvedPath(start: Coordinate, end: Coordinate, width: number, height: number) {
  const startPoint = projectPoint(start, width, height)
  const endPoint = projectPoint(end, width, height)
  const midX = (startPoint.x + endPoint.x) / 2
  const midY = Math.min(startPoint.y, endPoint.y) - height * 0.18
  return `M ${startPoint.x} ${startPoint.y} Q ${midX} ${midY} ${endPoint.x} ${endPoint.y}`
}

export function WorldMap({ dots = EMPTY_DOTS, lineColor = "#1e90ff", alt, className }: WorldMapProps) {
  const reducedMotion = usePrefersReducedMotion()
  const gradientId = useId().replaceAll(":", "")
  const svgMap = useMemo(() => {
    const map = new DottedMap({ height: 100, grid: "diagonal" })
    return map.getSVG({ radius: 0.22, color: "#00000033", shape: "circle", backgroundColor: "white" })
  }, [])
  const routes = useMemo(() => {
    const width = 800
    const height = 400
    return dots.map((dot) => ({
      ...dot,
      path: createCurvedPath(dot.start, dot.end, width, height),
      startPoint: projectPoint(dot.start, width, height),
      endPoint: projectPoint(dot.end, width, height),
    }))
  }, [dots])

  return (
    <div className={cn("relative aspect-[2/1] w-full bg-white", className)}>
      <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`} alt={alt} className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain" />
      <svg viewBox="0 0 800 400" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0" />
            <stop offset="10%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="90%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {routes.map((route, index) => (
          <g key={`${route.start.lat}-${route.start.lng}-${route.end.lat}-${route.end.lng}-${index}`}>
            <motion.path
              d={route.path}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="1"
              initial={reducedMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 1, delay: index * 0.2, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.circle
              cx={route.startPoint.x}
              cy={route.startPoint.y}
              r="2"
              fill={lineColor}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reducedMotion ? { duration: 0 } : { delay: index * 0.2 }}
            >
              {reducedMotion ? null : <animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite" />}
            </motion.circle>
            <circle cx={route.endPoint.x} cy={route.endPoint.y} r="2" fill={lineColor} />
          </g>
        ))}
      </svg>
    </div>
  )
}

export default WorldMap
