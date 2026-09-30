import type { CSSProperties } from "react"

type TechIconProps = {
  path: string
  title: string
  className?: string
  style?: CSSProperties
}

export function TechIcon({ path, title, className, style }: TechIconProps) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={title} fill="currentColor" className={className} style={style}>
      <path d={path} />
    </svg>
  )
}
