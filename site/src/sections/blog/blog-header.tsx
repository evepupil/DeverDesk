import { IconNews } from "@tabler/icons-react"
import { getAllPosts } from "@/content/blog"
import { fill, getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"
import { CONTAINER } from "@/lib/styles"

/** 博客列表页头：浅方格底纹（四周淡出）上放居中大标题、副标题和文章总数徽标。 */
export function BlogHeader({ locale }: { locale: Locale }) {
  const t = getMessages(locale)
  const total = getAllPosts(locale).length

  return (
    <section id="top" className="relative overflow-hidden">
      <div aria-hidden className="bg-grid mask-radial absolute inset-0" />
      <div className={cn(CONTAINER, "relative pt-28 pb-10 text-center md:pt-36 md:pb-14")}>
        <h1 className="text-4xl font-medium tracking-tight text-neutral-700 md:text-6xl">{t.blog.title}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-neutral-600 md:text-lg">{t.blog.subtitle}</p>
        {total > 0 ? (
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-neutral-600 shadow-sm ring-1 ring-black/5">
            <IconNews size={14} stroke={1.75} aria-hidden />
            <span data-blog-total={total}>{fill(t.blog.count, { n: total })}</span>
          </p>
        ) : null}
      </div>
    </section>
  )
}

export default BlogHeader
