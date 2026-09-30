import { IconArrowLeft } from "@tabler/icons-react"
import type { Post } from "@/content/blog"
import { formatDate, isoDay } from "@/content/format"
import { fill, getMessages } from "@/i18n"
import { localePath, type Locale } from "@/i18n/locales"
import { LogoMark } from "@/components/site/logo"
import { cn } from "@/lib/cn"
import { CONTAINER } from "@/lib/styles"
import { PostToc } from "./post-toc"

/** 标签键 → 词条显示名；词条里没有的键原样显示 */
function tagLabel(t: ReturnType<typeof getMessages>, tag: string): string {
  return (t.blog.tags as Record<string, string>)[tag] ?? tag
}

/** 文章正文（Blog Content With TOC）：左目录吸顶，右封面、标题、正文，分隔线后作者和日期。 */
export function PostArticle({ locale, post }: { locale: Locale; post: Post }) {
  const t = getMessages(locale)
  const hasHeadings = post.headings.length > 0

  return (
    <article id="article" className={cn(CONTAINER, "pt-24 md:pt-32")}>
      <a
        href={localePath(locale, "/blog/")}
        data-post-back
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
      >
        <IconArrowLeft size={16} stroke={1.75} aria-hidden />
        {t.blog.back}
      </a>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
        {/* 桌面：目录吸顶在左栏（宽内容 min-w-0 防止正文把网格撑破） */}
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{t.blog.toc}</p>
            <PostToc headings={post.headings} label={t.blog.toc} />
          </div>
        </aside>

        <div className="min-w-0 max-w-3xl">
          <img
            src={post.cover}
            alt={post.coverAlt}
            width={1600}
            height={1000}
            loading="eager"
            decoding="async"
            className="aspect-[16/10] w-full rounded-3xl bg-neutral-100 object-cover"
          />
          <h1 className="mt-8 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">{post.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-neutral-500">
            <LogoMark className="size-5" />
            <span className="text-neutral-800">{post.author}</span>
            <span aria-hidden className="text-neutral-300">
              ·
            </span>
            <time dateTime={isoDay(post.date)}>{fill(t.blog.published, { date: formatDate(post.date, locale) })}</time>
            <span aria-hidden className="text-neutral-300">
              ·
            </span>
            <span>{fill(t.common.minutesRead, { n: post.readingMinutes })}</span>
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {tagLabel(t, tag)}
              </span>
            ))}
          </div>

          {/* 手机：目录折叠块（无标题时不渲染） */}
          {hasHeadings ? (
            <details className="mt-8 rounded-xl bg-neutral-50 p-4 lg:hidden">
              <summary className="cursor-pointer text-sm font-medium text-neutral-800">{t.blog.toc}</summary>
              <ul className="mt-3 space-y-2">
                {post.headings.map((heading) => (
                  <li key={heading.id}>
                    <a
                      href={`#${heading.id}`}
                      className={
                        heading.depth === 3
                          ? "block pl-4 text-sm text-neutral-600 hover:text-neutral-900"
                          : "block text-sm text-neutral-600 hover:text-neutral-900"
                      }
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {/* 正文 HTML 由打包时 Markdown 转换生成（内容来自仓库文章文件，可信） */}
          <div
            data-post-body
            className="prose prose-neutral prose-dd mt-10"
            dangerouslySetInnerHTML={{ __html: post.html }}
          />

          <div className="mt-12 flex items-center gap-2 border-t border-neutral-200 pt-6 text-sm text-neutral-500">
            <LogoMark className="size-5" />
            <span className="text-neutral-800">{post.author}</span>
            <span aria-hidden className="text-neutral-300">
              ·
            </span>
            <time dateTime={isoDay(post.date)}>{formatDate(post.date, locale)}</time>
          </div>
        </div>
      </div>
    </article>
  )
}

export default PostArticle
