import { IconBrandGithub, IconStar } from "@tabler/icons-react"
import { fill, getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { formatCount, shouldShowStars } from "@/content/format"
import { REPO_URL } from "@/content/site"
import { cn } from "@/lib/cn"
import { buttonClass, type ButtonSize } from "@/lib/styles"
import { NewTabHint } from "./external-mark"

export function GithubButton({
  locale,
  stars,
  size = "sm",
  className,
}: {
  locale: Locale
  stars: number | null
  size?: ButtonSize
  className?: string
}) {
  const t = getMessages(locale)

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-github-button
      aria-label={shouldShowStars(stars) ? fill(t.common.githubStarsAria, { n: stars }) : t.common.githubAria}
      className={buttonClass("secondary", size, cn("gap-2", className))}
    >
      <IconBrandGithub size={16} stroke={1.75} aria-hidden />
      {shouldShowStars(stars) ? (
        <span className="flex items-center gap-1 tabular-nums">
          <IconStar size={14} stroke={1.75} className="text-neutral-400" aria-hidden />
          {formatCount(stars)}
        </span>
      ) : (
        <span>{t.common.star}</span>
      )}
      <NewTabHint locale={locale} />
    </a>
  )
}
