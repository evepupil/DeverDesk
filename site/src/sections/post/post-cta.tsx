import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { APP_URL, REPO_URL } from "@/content/site"
import { NewTabHint } from "@/components/site/external-mark"
import { cn } from "@/lib/cn"
import { buttonClass, CARD, CONTAINER } from "@/lib/styles"
import { externalRel } from "@/lib/links"

/**
 * 收尾卡右上的小光带：首屏四道斜条的缩小版（同一套点坐标和颜色，不做淡出遮罩），
 * 靠卡片 overflow-hidden 裁掉出界部分。
 */
function CtaBeam() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute -top-6 -right-6 h-[260px] w-[234px] opacity-70"
      viewBox="0 0 1440 1600"
      preserveAspectRatio="xMaxYMin meet"
      fill="none"
    >
      <polygon points="1557,0 1637,0 388,1600 308,1600" fill="#1e90ff" />
      <polygon points="1637,0 1697,0 448,1600 388,1600" fill="#5cb3ff" />
      <polygon points="1697,0 1767,0 518,1600 448,1600" fill="#9ccfff" />
      <polygon points="1767,0 1877,0 628,1600 518,1600" fill="#d6ebff" />
    </svg>
  )
}

/** 收尾卡：看完文章后引导试用 / 看 GitHub，内容栏和正文右栏对齐。 */
export function PostCta({ locale }: { locale: Locale }) {
  const t = getMessages(locale)

  return (
    <section id="try" className={cn(CONTAINER, "py-16 md:py-24")}>
      <div className="max-w-3xl lg:ml-[284px]">
        <div className={cn(CARD, "relative overflow-hidden p-8 md:p-10")}>
          <CtaBeam />
          <h2 className="relative text-2xl tracking-tight text-neutral-800 md:text-3xl">{t.blog.ctaTitle}</h2>
          <p className="relative mt-2 max-w-md text-base text-neutral-600">{t.blog.ctaBody}</p>
          <div className="relative mt-6 flex flex-wrap gap-3">
            <a href={APP_URL} data-cta="post-try" className={buttonClass("primary", "md")}>
              {t.common.tryDemo}
              <IconArrowRight size={18} stroke={1.75} aria-hidden />
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel={externalRel(REPO_URL)}
              className={buttonClass("secondary", "md")}
            >
              <IconBrandGithub size={18} stroke={1.75} aria-hidden />
              {t.common.viewOnGithub}
              <NewTabHint locale={locale} />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

export default PostCta
