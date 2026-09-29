import { cn } from "cn"

import type { GlyphTone, StatusGlyph } from "@/data/catalog"

const TONE_COLOR: Record<GlyphTone, string> = {
  progress: "var(--progress)",
  done: "var(--done)",
  risk: "var(--risk)",
  idle: "var(--idle)",
  neutral: "var(--text-secondary)",
}

interface StatusIconProps {
  glyph: StatusGlyph
  tone: GlyphTone
  size?: number
  className?: string
  /** 需要被读屏读出时传入 */
  label?: string
}

/**
 * 状态图形：颜色只用来识别（提炼）。空心圈=未开始，半圈=进行中，实心勾=已结束，
 * 叉=已取消，感叹号=风险。所有图形都在 14×14 的格子里，线宽与细线图标一致。
 */
export function StatusIcon({ glyph, tone, size = 14, className, label }: StatusIconProps) {
  const color = TONE_COLOR[tone]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", className)}
    >
      {glyph === "ring" && <circle cx="7" cy="7" r="5.3" stroke={color} strokeWidth="1.5" />}
      {glyph === "dashed" && (
        <circle cx="7" cy="7" r="5.3" stroke={color} strokeWidth="1.5" strokeDasharray="2.1 2.1" />
      )}
      {glyph === "half" && (
        <>
          <circle cx="7" cy="7" r="5.3" stroke={color} strokeWidth="1.5" />
          <path d="M7 3.4a3.6 3.6 0 0 1 0 7.2z" fill={color} />
        </>
      )}
      {glyph === "dot" && (
        <>
          <circle cx="7" cy="7" r="5.3" stroke={color} strokeWidth="1.5" />
          <circle cx="7" cy="7" r="2.1" fill={color} />
        </>
      )}
      {glyph === "check" && (
        <>
          <circle cx="7" cy="7" r="6" fill={color} />
          <path
            d="M4.5 7.2l1.7 1.7 3.4-3.6"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {glyph === "cross" && (
        <>
          <circle cx="7" cy="7" r="6" fill={color} />
          <path d="M5.1 5.1l3.8 3.8M8.9 5.1L5.1 8.9" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {glyph === "alert" && (
        <>
          <circle cx="7" cy="7" r="6" fill={color} />
          <path d="M7 4v3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="7" cy="9.8" r="0.9" fill="#fff" />
        </>
      )}
      {glyph === "minus" && (
        <>
          <circle cx="7" cy="7" r="6" fill={color} />
          <path d="M4.6 7h4.8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
