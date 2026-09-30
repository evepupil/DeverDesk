import { IconStarFilled } from "@tabler/icons-react"
import type { PostMeta } from "@/content/blog"
import { formatDate, isoDay } from "@/content/format"
import { fill, getMessages } from "@/i18n"
import { localePath, type Locale } from "@/i18n/locales"
import { LogoMark } from "@/components/site/logo"
import { cn } from "@/lib/cn"
import { CONTAINER } from "@/lib/styles"

/** 标签键 → 词条显示名；词条里没有的键原样显示 */
const tagLabel = (tag: string, locale: Locale) => {
  const t = getMessages(locale)
  return (t.blog.tags as Record<string, string>)[tag] ?? tag
}

/** 置顶文章大卡（Blog With Search 顶部）：整卡一个链接，左图右文，底部作者 + 日期。 */
export function FeaturedPost({ locale, post }: { locale: Locale; post: PostMeta }) {
  const t = getMessages(locale)

  return (
    <section id="featured" className={cn(CONTAINER, "pb-10 md:pb-16")}>
      <a
        href={localePath(locale, `/blog/${post.slug}/`)}
        data-featured-post={post.slug}
        className="group grid grid-cols-1 gap-6 rounded-3xl p-2 ring-1 ring-transparent transition-colors hover:bg-neutral-50 hover:ring-neutral-200 md:grid-cols-2 md:gap-10 md:p-3"
      >
        <div className="aspect-[16/10] overflow-hidden rounded-2xl bg-neutral-100">
          <img
            src={post.cover}
            alt={post.coverAlt}
            width={1600}
            height={1000}
            loading="eager"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
        <div className="flex flex-col py-2 md:py-4">
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-deep">
            <IconStarFilled size={12} aria-hidden />
            {t.blog.featured}
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900 md:text-4xl">{post.title}</h2>
          <p className="mt-4 line-clamp-4 text-base text-neutral-600 md:text-lg">{post.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-600">
                {tagLabel(tag, locale)}
              </span>
            ))}
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-6 text-sm text-neutral-500">
            <LogoMark className="size-5" />
            <span className="text-neutral-800">{post.author}</span>
            <span aria-hidden className="text-neutral-300">
              ·
            </span>
            <time dateTime={isoDay(post.date)}>{formatDate(post.date, locale)}</time>
            <span aria-hidden className="text-neutral-300">
              ·
            </span>
            <span>{fill(t.common.minutesRead, { n: post.readingMinutes })}</span>
          </div>
        </div>
      </a>
    </section>
  )
}

export default FeaturedPost
