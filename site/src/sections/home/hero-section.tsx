import { IconArrowRight, IconBrandGithub, IconLock } from "@tabler/icons-react"

import { NewTabHint } from "@/components/site/external-mark"
import { BrowserFrame } from "@/components/site/browser-frame"
import { Screenshot } from "@/components/site/screenshot"
import { APP_URL, REPO_URL } from "@/content/site"
import { getMessages } from "@/i18n"
import { localePath, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"
import { CONTAINER, buttonClass } from "@/lib/styles"

/**
 * H2 首屏：白底 + 右上斜向蓝色光带 + 浏览器框真截图。
 * 光带层 pointer-events-none 且压在内容下面（内容容器 relative z-10），只做背景装饰；
 * 光带本身不动（这里按规格静止）。
 */
export function HeroSection({ locale }: { locale: Locale }) {
  const t = getMessages(locale)

  return (
    <section id="top" className="relative overflow-hidden bg-white">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <svg
          className="absolute top-[260px] right-0 h-[1100px] w-[990px] opacity-70 md:top-0 md:h-[1600px] md:w-[1440px] md:opacity-100"
          viewBox="0 0 1440 1600"
          fill="none"
          preserveAspectRatio="xMaxYMin meet"
        >
          <defs>
            <linearGradient id="hero-beam-fade" x1="0" y1="0" x2="0" y2="1600" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="white" stopOpacity="1" />
              <stop offset="0.55" stopColor="white" stopOpacity="1" />
              <stop offset="0.8" stopColor="white" stopOpacity="0.35" />
              <stop offset="1" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <mask id="hero-beam-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="1600">
              <rect x="0" y="0" width="1440" height="1600" fill="url(#hero-beam-fade)" />
            </mask>
          </defs>
          <g mask="url(#hero-beam-mask)">
            <polygon points="1557,0 1637,0 388,1600 308,1600" fill="#1e90ff" />
            <polygon points="1637,0 1697,0 448,1600 388,1600" fill="#5cb3ff" />
            <polygon points="1697,0 1767,0 518,1600 448,1600" fill="#9ccfff" />
            <polygon points="1767,0 1877,0 628,1600 518,1600" fill="#d6ebff" />
          </g>
        </svg>
      </div>

      <div className={cn(CONTAINER, "relative z-10 pt-24 pb-10 md:pt-32 md:pb-20")}>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-hero-pill
          className="group inline-flex items-center gap-2 text-sm text-neutral-800 transition-colors hover:text-neutral-950"
        >
          <IconBrandGithub size={16} stroke={1.75} aria-hidden />
          <span>{t.home.hero.pill}</span>
          <IconArrowRight
            size={14}
            stroke={1.75}
            aria-hidden
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
          <NewTabHint locale={locale} />
        </a>

        <h1 className="mt-4 max-w-3xl text-4xl leading-[1.12] font-medium tracking-tight text-neutral-700 text-balance md:text-7xl md:leading-[1.04] break-keep">
          {t.home.hero.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base text-neutral-700 md:text-xl">{t.home.hero.lead}</p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a href={APP_URL} data-cta="hero-try" className={buttonClass("primary", "md")}>
            {t.common.tryDemo}
            <IconArrowRight size={18} stroke={1.75} aria-hidden />
          </a>
          <a href={localePath(locale, "/#open-source")} data-cta="hero-self-host" className={buttonClass("secondary", "md")}>
            {t.home.hero.secondary}
          </a>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-sm text-neutral-500">
          <IconLock size={14} stroke={1.75} aria-hidden />
          {t.home.hero.note}
        </p>

        <div className="relative mt-12 md:mt-24">
          <BrowserFrame url={t.home.hero.frameUrl} bodyClassName="bg-neutral-50">
            <Screenshot name="today" locale={locale} alt={t.home.hero.shotAlt} eager />
          </BrowserFrame>
        </div>
      </div>
    </section>
  )
}

export default HeroSection
