"use client"

import { useMemo, useState } from "react"
import { IconSearch } from "@tabler/icons-react"
import type { PostMeta } from "@/content/blog"
import { formatDate, isoDay } from "@/content/format"
import { fill, getMessages } from "@/i18n"
import { localePath, type Locale } from "@/i18n/locales"
import { LogoMark } from "@/components/site/logo"
import { cn } from "@/lib/cn"
import { buttonClass, CONTAINER } from "@/lib/styles"

/** 标签键 → 词条显示名；词条里没有的键原样显示 */
function tagLabel(t: ReturnType<typeof getMessages>, name: string): string {
  return (t.blog.tags as Record<string, string>)[name] ?? name
}

/** 文章列表 + 搜索（Blog With Search 的 More Posts）：标题行右侧一个受控搜索框，下面一行一篇。 */
export function PostList({ locale, posts }: { locale: Locale; posts: PostMeta[] }) {
  const t = getMessages(locale)
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState<string | null>(null)

  /** posts 里出现过的标签，去重、按首次出现顺序排 */
  const tags = useMemo(() => {
    const seen: string[] = []
    for (const post of posts) {
      for (const name of post.tags) {
        if (!seen.includes(name)) seen.push(name)
      }
    }
    return seen
  }, [posts])

  /** 标签和搜索词必须同时满足；搜索词匹配标题、摘要或任一标签的显示名（都转小写） */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return posts.filter((post) => {
      if (tag !== null && !post.tags.includes(tag)) return false
      if (needle === "") return true
      const haystack = [post.title, post.description, ...post.tags.map((name) => tagLabel(t, name))]
        .join("\n")
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [posts, query, tag, t])

  const chipClass = (selected: boolean) =>
    selected
      ? "rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
      : "rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-neutral-900"

  if (posts.length === 0) return null

  return (
    <section id="posts" className={cn(CONTAINER, "pb-20 md:pb-32")}>
      <div className="flex flex-col gap-4 border-b border-neutral-200 pb-6 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">{t.blog.more}</h2>
        <label className="relative block w-full md:max-w-md">
          <span className="sr-only">{t.blog.searchLabel}</span>
          <IconSearch
            size={16}
            stroke={1.75}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
          />
          {/* 受控输入：交互检查会通过原型 setter 赋值再派发 input 事件，必须保持 value + onChange */}
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-post-search
            placeholder={t.blog.searchPlaceholder}
            className="h-10 w-full rounded-lg bg-white pr-3 pl-9 text-sm text-neutral-900 shadow-sm ring-1 ring-neutral-200 placeholder:text-neutral-500 focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>
      </div>

      <div role="group" aria-label={t.blog.searchLabel} className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          data-post-tag="all"
          aria-pressed={tag === null}
          onClick={() => setTag(null)}
          className={chipClass(tag === null)}
        >
          {t.blog.allTags}
        </button>
        {tags.map((name) => (
          <button
            key={name}
            type="button"
            data-post-tag={name}
            aria-pressed={tag === name}
            onClick={() => setTag((current) => (current === name ? null : name))}
            className={chipClass(tag === name)}
          >
            {tagLabel(t, name)}
          </button>
        ))}
      </div>

      <p aria-live="polite" data-post-count={visible.length} className="mt-4 text-sm text-neutral-500">
        {fill(t.blog.count, { n: visible.length })}
      </p>

      {visible.length > 0 ? (
        <ul className="divide-y divide-neutral-200">
          {visible.map((post) => (
            <li key={post.slug}>
              <a
                href={localePath(locale, `/blog/${post.slug}/`)}
                data-post-row={post.slug}
                className="group flex items-start gap-6 py-8"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-medium text-neutral-900 transition-colors group-hover:text-brand-deep">
                    {post.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-neutral-600 md:text-base">{post.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
                    <time dateTime={isoDay(post.date)}>{formatDate(post.date, locale)}</time>
                    <span aria-hidden className="text-neutral-300">
                      ·
                    </span>
                    <span>{fill(t.common.minutesRead, { n: post.readingMinutes })}</span>
                    {post.tags.map((name) => (
                      <span key={name} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                        {tagLabel(t, name)}
                      </span>
                    ))}
                  </div>
                </div>
                <LogoMark className="mt-1 size-10 shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div data-post-empty className="py-16 text-center">
          <IconSearch size={24} stroke={1.5} aria-hidden className="mx-auto text-neutral-400" />
          <p className="mt-3 text-sm text-neutral-600">{fill(t.blog.empty, { q: query.trim() })}</p>
          <button
            type="button"
            data-post-clear
            onClick={() => {
              setQuery("")
              setTag(null)
            }}
            className={buttonClass("secondary", "sm", "mt-4")}
          >
            {t.blog.clear}
          </button>
        </div>
      )}
    </section>
  )
}

export default PostList
