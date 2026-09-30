import { IconBrandGithub, IconGitBranch } from "@tabler/icons-react"
import { NewTabHint } from "@/components/site/external-mark"
import { formatDate } from "@/content/format"
import { CHANGELOG } from "@/content/changelog"
import { APP_URL, WATCH_URL } from "@/content/site"
import { fill, getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { buttonClass, CONTAINER } from "@/lib/styles"
import { cn } from "@/lib/cn"
import { externalRel } from "@/lib/links"

/** 版本锚点：v0.4.1 → release-v0-4-1（和时间线各写一份，不互相 import） */
function releaseId(version: string): string {
  return "release-" + version.replaceAll(".", "-")
}

export function ChangelogHeader({ locale }: { locale: Locale }) {
  const t = getMessages(locale)
  const latest = CHANGELOG[0]

  return (
    <section id="top" className="relative overflow-hidden border-b border-neutral-100 bg-white">
      {/* 缩小的首屏光带：同一套四道斜条只画右上一角，下半截用渐变蒙版淡出 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <svg
          className="absolute top-0 right-0 h-[520px] w-[468px] md:h-[760px] md:w-[684px]"
          viewBox="0 0 1440 1600"
          fill="none"
          preserveAspectRatio="xMaxYMin meet"
        >
          <defs>
            <linearGradient id="changelog-beam-fade" x1="0" y1="0" x2="0" y2="1600" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="white" stopOpacity="1" />
              <stop offset="0.55" stopColor="white" stopOpacity="1" />
              <stop offset="0.8" stopColor="white" stopOpacity="0.35" />
              <stop offset="1" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <mask id="changelog-beam-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1440" height="1600">
              <rect x="0" y="0" width="1440" height="1600" fill="url(#changelog-beam-fade)" />
            </mask>
          </defs>
          <g mask="url(#changelog-beam-mask)">
            <polygon points="1557,0 1637,0 388,1600 308,1600" fill="#1e90ff" />
            <polygon points="1637,0 1697,0 448,1600 388,1600" fill="#5cb3ff" />
            <polygon points="1697,0 1767,0 518,1600 448,1600" fill="#9ccfff" />
            <polygon points="1767,0 1877,0 628,1600 518,1600" fill="#d6ebff" />
          </g>
        </svg>
      </div>

      <div className={cn(CONTAINER, "relative z-10 pt-28 pb-12 md:pt-36 md:pb-16")}>
        {latest ? (
          <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600">
            <IconGitBranch size={16} stroke={1.75} aria-hidden />
            <span data-release-count={CHANGELOG.length}>{fill(t.changelog.releases, { n: CHANGELOG.length })}</span>
            <span aria-hidden className="text-neutral-300">
              ·
            </span>
            <span>{fill(t.changelog.lastUpdated, { date: formatDate(latest.date, locale) })}</span>
          </p>
        ) : null}
        <h1 className="mt-4 text-4xl font-medium tracking-tight text-neutral-700 md:text-6xl">{t.changelog.title}</h1>
        <p className="mt-4 max-w-2xl text-base text-neutral-600 md:text-lg">{t.changelog.subtitle}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={WATCH_URL}
            target="_blank"
            rel={externalRel(WATCH_URL)}
            data-cta="changelog-watch"
            className={buttonClass("secondary", "sm")}
          >
            <IconBrandGithub size={16} stroke={1.75} aria-hidden />
            {t.changelog.watch}
            <NewTabHint locale={locale} />
          </a>
          <a href={APP_URL} data-cta="changelog-try" className={buttonClass("primary", "sm")}>
            {t.common.tryDemo}
          </a>
        </div>

        {latest ? (
          <nav aria-label={t.changelog.title} className="mt-10 flex flex-wrap gap-2">
            {CHANGELOG.map((entry) => (
              <a
                key={entry.version}
                href={`#${releaseId(entry.version)}`}
                data-version-link={entry.version}
                className="rounded-full bg-neutral-100 px-3 py-1 font-mono text-xs text-neutral-700 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
              >
                {entry.version}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
    </section>
  )
}

export default ChangelogHeader
