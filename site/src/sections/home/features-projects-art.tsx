import { PROJECT_ROWS } from "@/content/home"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"

type ProjectRow = (typeof PROJECT_ROWS)[number]

/** 副业方块的颜色，和产品样例数据一致 */
const COLOR_CLASSES: Record<ProjectRow["color"], string> = {
  indigo: "bg-label-indigo",
  blue: "bg-label-blue",
  amber: "bg-label-amber",
}

/** 阶段小圆点：运营中绿、搭建中黄（和产品的阶段颜色一个意思） */
const STAGE_DOT_CLASSES: Record<ProjectRow["stage"], string> = {
  running: "bg-dd-good",
  building: "bg-dd-progress",
}

/** 月目标进度条：运营中用品牌蓝，搭建中用黄 */
const STAGE_BAR_CLASSES: Record<ProjectRow["stage"], string> = {
  running: "bg-brand-primary",
  building: "bg-dd-progress",
}

/** 功能 Bento 第 2 张卡的插画：副业按阶段排着，每行本月净收入和月目标进度 */
export function FeaturesProjectsArt({ locale }: { locale: Locale }) {
  const { columns, rows } = getMessages(locale).home.features.projects

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 border-b border-neutral-100 px-4 py-2 text-[11px] text-neutral-500">
        <span aria-hidden="true" />
        <span>{columns[0]}</span>
        <span className="text-right">{columns[1]}</span>
        <span className="text-right">{columns[2]}</span>
      </div>
      {rows.map((row, index) => {
        const meta = PROJECT_ROWS[index]
        if (!meta) return null

        return (
          <div key={row.name} className="px-4 py-2.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 text-[13px]">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-[3px]", COLOR_CLASSES[meta.color])} aria-hidden="true" />
                <span className="truncate text-neutral-800">{row.name}</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] whitespace-nowrap text-neutral-600">
                <span className={cn("size-1.5 rounded-full", STAGE_DOT_CLASSES[meta.stage])} aria-hidden="true" />
                {row.stage}
              </span>
              <span className="text-right tabular-nums text-neutral-700">{row.net}</span>
              <span className="text-right font-semibold tabular-nums text-neutral-900">{row.goal}</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-neutral-100">
              <div className={cn("h-full rounded-full", STAGE_BAR_CLASSES[meta.stage])} style={{ width: `${meta.goal * 100}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default FeaturesProjectsArt
