import { IconBrandCloudflare, IconBrandGithub, IconCheck, IconGitCommit, IconGitFork, IconScale, IconStar } from "@tabler/icons-react"
import { fill, getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { CodeBlock } from "@/components/aceternity/code-block"
import { NewTabHint } from "@/components/site/external-mark"
import { TextLink } from "@/components/site/text-link"
import { formatCount, formatDate, formatShortDate, isoDay } from "@/content/format"
import { getRecentCommits, getRepoStats } from "@/content/github"
import { CLONE_URL, DEPLOY_URL, LICENSE_NAME, LICENSE_URL, REPO_DIR, REPO_SLUG, REPO_URL } from "@/content/site"
import { cn } from "@/lib/cn"
import { buttonClass, CARD, CONTAINER, SECTION_TITLE, SECTION_Y } from "@/lib/styles"

export async function OpenSourceSection({ locale }: { locale: Locale }) {
  const [stats, commits] = await Promise.all([getRepoStats(), getRecentCommits(5)])
  const t = getMessages(locale)
  const [owner = REPO_SLUG, repository = REPO_SLUG] = REPO_URL.replace(/^https:\/\/github\.com\//, "").split("/")

  return (
    <section id="open-source" className={cn(CONTAINER, SECTION_Y)}>
      <div className="grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
            <IconBrandGithub size={14} stroke={1.75} aria-hidden />
            {t.home.openSource.eyebrow}
          </p>
          <h2 className={cn(SECTION_TITLE, "mt-4")}>{t.home.openSource.title}</h2>
          <p className="mt-4 max-w-xl text-base text-neutral-600 md:text-lg">{t.home.openSource.body}</p>
          <ul className="mt-6 space-y-3">
            {t.home.openSource.points.map((point) => (
              <li key={point} className="flex gap-3 text-sm text-neutral-700 md:text-base">
                <IconCheck size={18} stroke={2} aria-hidden className="mt-0.5 shrink-0 text-brand-deep" />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-cta="os-github"
              className={buttonClass("primary", "md")}
            >
              <IconBrandGithub size={18} stroke={1.75} aria-hidden />
              {t.common.viewOnGithub}
              <NewTabHint locale={locale} />
            </a>
            <a
              href={DEPLOY_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-cta="os-deploy"
              className={buttonClass("secondary", "md")}
            >
              <IconBrandCloudflare size={18} stroke={1.75} aria-hidden />
              {t.common.deploy}
              <NewTabHint locale={locale} />
            </a>
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-neutral-500">
            <IconScale size={16} stroke={1.75} aria-hidden />
            <a
              href={LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:text-neutral-900 hover:underline"
            >
              {LICENSE_NAME}
              <NewTabHint locale={locale} />
            </a>
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div data-repo-card className={cn(CARD, "p-5")}>
            <div className="flex items-center gap-2">
              <IconBrandGithub size={20} stroke={1.75} className="text-neutral-800" aria-hidden />
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm font-medium text-neutral-900 hover:underline"
              >
                {owner}<span className="mx-0.5 text-neutral-400">/</span>{repository}
                <NewTabHint locale={locale} />
              </a>
            </div>
            <p className="mt-3 text-sm text-neutral-600">{t.home.openSource.repoDescription}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-label-blue" />
                {stats.language}
              </span>
              {stats.stars !== null ? (
                <span data-stat="stars" className="flex items-center gap-1 tabular-nums">
                  <IconStar size={14} stroke={1.75} aria-hidden />
                  {formatCount(stats.stars)} {t.home.openSource.stars}
                </span>
              ) : null}
              {stats.forks !== null ? (
                <span className="flex items-center gap-1 tabular-nums">
                  <IconGitFork size={14} stroke={1.75} aria-hidden />
                  {formatCount(stats.forks)} {t.home.openSource.forks}
                </span>
              ) : null}
              <span className="flex items-center gap-1">
                <IconScale size={14} stroke={1.75} aria-hidden />
                {stats.license}
              </span>
              {stats.pushedOn !== null ? (
                <span>{fill(t.home.openSource.updated, { date: formatDate(stats.pushedOn, locale) })}</span>
              ) : null}
            </div>
          </div>

          <CodeBlock
            language="bash"
            filename={t.home.openSource.terminal}
            code={`git clone ${CLONE_URL}\ncd ${REPO_DIR}\npnpm install\npnpm dev`}
            copyLabel={t.home.openSource.copy}
            copiedLabel={t.home.openSource.copied}
          />
          <p className="-mt-1 px-1 text-xs text-neutral-500">{t.home.openSource.terminalNote}</p>

          {commits.length > 0 ? (
            <div data-commits className={cn(CARD, "p-5")}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                  <IconGitCommit size={16} stroke={1.75} aria-hidden />
                  {t.home.openSource.commitsTitle}
                </h3>
                <TextLink href={`${REPO_URL}/commits/main`} external className="text-xs">
                  {t.home.openSource.allCommits}
                  <NewTabHint locale={locale} />
                </TextLink>
              </div>
              <ul className="mt-3 divide-y divide-neutral-100">
                {commits.map((commit) => (
                  <li key={commit.sha}>
                    <a
                      href={commit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-commit={commit.shortSha}
                      aria-label={fill(t.home.openSource.commitAria, { sha: commit.shortSha })}
                      className="group flex items-center gap-3 py-2.5"
                    >
                      <span className="shrink-0 font-mono text-xs text-brand-deep">{commit.shortSha}</span>
                      {commit.type ? (
                        <span className="shrink-0 rounded-sm bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600">
                          {commit.type}
                        </span>
                      ) : null}
                      <span
                        lang={/[\u4e00-\u9fff]/.test(commit.subject) ? "zh-CN" : "en"}
                        className="min-w-0 flex-1 truncate text-sm text-neutral-700 group-hover:text-neutral-900"
                      >
                        {commit.subject}
                      </span>
                      <time dateTime={isoDay(commit.date)} className="shrink-0 text-xs tabular-nums text-neutral-500">
                        {formatShortDate(commit.date, locale)}
                      </time>
                      <NewTabHint locale={locale} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default OpenSourceSection
