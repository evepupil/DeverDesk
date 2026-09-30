import { IconArrowLeft, IconArrowRight, IconPencil } from "@tabler/icons-react"
import type { PostMeta } from "@/content/blog"
import { getMessages } from "@/i18n"
import { localePath, type Locale } from "@/i18n/locales"
import { editUrl } from "@/content/site"
import { NewTabHint } from "@/components/site/external-mark"
import { cn } from "@/lib/cn"
import { externalRel } from "@/lib/links"
import { CARD_SOFT, CONTAINER } from "@/lib/styles"

/** 文末：编辑链接 + 上一篇 / 下一篇；内容栏和正文右栏对齐（目录 220px + 间距 64px）。 */
export function PostFooter({ locale, post, newer, older }: { locale: Locale; post: PostMeta; newer: PostMeta | null; older: PostMeta | null }) {
  const t = getMessages(locale)
  const editHref = editUrl(`site/content/blog/${post.slug}/${locale}.md`)

  return (
    <section id="more" className={cn(CONTAINER, "pt-10")}>
      <div className="max-w-3xl lg:ml-[284px]">
        <a
          href={editHref}
          target="_blank"
          rel={externalRel(editHref)}
          data-post-edit
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
        >
          <IconPencil size={14} stroke={1.75} aria-hidden />
          {t.blog.editPost}
          <NewTabHint locale={locale} />
        </a>

        {newer !== null || older !== null ? (
          <nav aria-label={t.blog.back} className="mt-8 grid gap-4 sm:grid-cols-2">
            {newer !== null ? (
              <a
                href={localePath(locale, `/blog/${newer.slug}/`)}
                data-post-newer={newer.slug}
                className={cn(CARD_SOFT, "group block p-5 transition-shadow hover:shadow-md")}
              >
                <p className="flex items-center gap-1 text-xs text-neutral-500">
                  <IconArrowLeft size={14} stroke={1.75} aria-hidden />
                  {t.blog.newer}
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-neutral-900 group-hover:text-brand-deep">
                  {newer.title}
                </p>
              </a>
            ) : null}
            {older !== null ? (
              <a
                href={localePath(locale, `/blog/${older.slug}/`)}
                data-post-older={older.slug}
                className={cn(CARD_SOFT, "group block p-5 text-right transition-shadow hover:shadow-md sm:col-start-2")}
              >
                <p className="flex items-center justify-end gap-1 text-xs text-neutral-500">
                  {t.blog.older}
                  <IconArrowRight size={14} stroke={1.75} aria-hidden />
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-neutral-900 group-hover:text-brand-deep">
                  {older.title}
                </p>
              </a>
            ) : null}
          </nav>
        ) : null}
      </div>
    </section>
  )
}

export default PostFooter
