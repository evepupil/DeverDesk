import { Timeline, type TimelineEntry } from "@/components/aceternity/timeline"
import { CHANGELOG } from "@/content/changelog"
import { formatDate, isoDay } from "@/content/format"
import type { Locale } from "@/i18n/locales"
import { CONTAINER } from "@/lib/styles"
import { cn } from "@/lib/cn"
import { ChangelogRelease } from "./changelog-release"

/** 版本锚点：v0.4.1 → release-v0-4-1（和页头各写一份，不互相 import） */
function releaseId(version: string): string {
  return "release-" + version.replaceAll(".", "-")
}

export function ChangelogTimeline({ locale }: { locale: Locale }) {
  // 服务端把每条渲染成 React 元素放进 data，Timeline（客户端组件）只负责吸顶和光束动画
  const entries: TimelineEntry[] = CHANGELOG.map((entry) => ({
    id: releaseId(entry.version),
    title: entry.version,
    aside: (
      <time dateTime={isoDay(entry.date)} className="text-sm font-medium text-neutral-500">
        {formatDate(entry.date, locale)}
      </time>
    ),
    content: <ChangelogRelease entry={entry} locale={locale} />,
  }))

  return (
    <section id="releases" className={cn(CONTAINER, "pb-16 md:pb-24")}>
      <Timeline data={entries} />
    </section>
  )
}

export default ChangelogTimeline
