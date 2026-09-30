"use client"

import { useEffect, useState } from "react"
import type { PostHeading } from "@/content/blog"

/**
 * 目录高亮：IntersectionObserver 观察每个标题元素，
 * 最后一个进入「顶栏下方 96px ～ 视口上 30%」这条带的就是当前章节。
 * 四种（层级 × 是否高亮）组合都是完整类名，不拼字符串。
 */

const TOC_LINK: Record<2 | 3, Record<"active" | "idle", string>> = {
  2: {
    active: "-ml-px block border-l border-neutral-900 py-0.5 pl-4 text-sm text-neutral-900",
    idle: "-ml-px block border-l border-transparent py-0.5 pl-4 text-sm text-neutral-500 transition-colors hover:text-neutral-900",
  },
  3: {
    active: "-ml-px block border-l border-neutral-900 py-0.5 pl-7 text-sm text-neutral-900",
    idle: "-ml-px block border-l border-transparent py-0.5 pl-7 text-sm text-neutral-500 transition-colors hover:text-neutral-900",
  },
}

export function PostToc({ headings, label }: { headings: PostHeading[]; label: string }) {
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null)

  useEffect(() => {
    if (headings.length === 0) return
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // 取「最靠近观察带顶部」的可见标题作为当前章节
        const visibleTop = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visibleTop.length > 0) setActive(visibleTop[0].target.id)
      },
      { rootMargin: "-96px 0px -70% 0px" },
    )
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [headings])

  if (headings.length === 0) return null

  return (
    <nav aria-label={label}>
      <ul className="mt-3 space-y-2 border-l border-neutral-200">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              data-toc-link={heading.id}
              aria-current={heading.id === active ? "true" : undefined}
              className={TOC_LINK[heading.depth][heading.id === active ? "active" : "idle"]}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default PostToc
