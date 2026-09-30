import type { ChangelogEntry } from "@/content/changelog"
import { BrowserFrame } from "@/components/site/browser-frame"
import { Screenshot } from "@/components/site/screenshot"
import { IconGitCommit } from "@tabler/icons-react"
import { commitUrl } from "@/content/site"
import { fill, getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"

/** 类型标签的底色：用对象映射完整类名，Tailwind 只认完整类名 */
const KIND_BADGE: Record<ChangelogEntry["changes"][number]["kind"], string> = {
  new: "mt-0.5 min-w-16 shrink-0 rounded-sm bg-brand-soft px-1.5 py-0.5 text-center text-[11px] font-medium text-brand-deep",
  improved: "mt-0.5 min-w-16 shrink-0 rounded-sm bg-neutral-100 px-1.5 py-0.5 text-center text-[11px] font-medium text-neutral-700",
  fixed: "mt-0.5 min-w-16 shrink-0 rounded-sm bg-dd-good/10 px-1.5 py-0.5 text-center text-[11px] font-medium text-dd-good",
}

/**
 * 单条更新的正文（服务端组件）：标题、摘要、配图、改动清单、对应提交。
 * 由时间线区块把渲染结果作为 Timeline 的 content 传下去，不传函数。
 */
export function ChangelogRelease({ entry, locale }: { entry: ChangelogEntry; locale: Locale }) {
  const t = getMessages(locale)

  return (
    <article data-release-body={entry.version} className="max-w-3xl pb-4">
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl">{entry.title[locale]}</h2>
      <p className="mt-3 text-base text-neutral-600">{entry.summary[locale]}</p>

      {entry.shot ? (
        <div className="mt-6">
          <BrowserFrame url={t.home.hero.frameUrl} bodyClassName="bg-neutral-50">
            <Screenshot name={entry.shot} locale={locale} alt={fill(t.changelog.shotAlt, { version: entry.version })} />
          </BrowserFrame>
        </div>
      ) : null}

      <ul className="mt-6 space-y-3">
        {entry.changes.map((change) => (
          <li key={change.text.en} data-change-kind={change.kind} className="flex items-start gap-3 text-sm text-neutral-700 md:text-base">
            <span className={KIND_BADGE[change.kind]}>{t.changelog.kinds[change.kind]}</span>
            <span className="min-w-0 break-words">{change.text[locale]}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
          <IconGitCommit size={14} stroke={1.75} aria-hidden />
          {t.changelog.commits}
        </span>
        {entry.commits.map((sha) => (
          <a
            key={sha}
            href={commitUrl(sha)}
            target="_blank"
            rel="noopener noreferrer"
            data-release-commit={sha.slice(0, 7)}
            aria-label={fill(t.changelog.commitAria, { sha: sha.slice(0, 7) })}
            className="rounded-md bg-neutral-50 px-2 py-0.5 font-mono text-xs text-brand-deep ring-1 ring-neutral-200 transition-colors hover:bg-neutral-100"
          >
            {sha.slice(0, 7)}
          </a>
        ))}
      </div>
    </article>
  )
}

export default ChangelogRelease
