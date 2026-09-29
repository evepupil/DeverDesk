"use client"

import { cn } from "cn"
import { ChevronRight, Download, FilterX, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/base/empty-state"
import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { CHANNELS, ENTRY_STATUS, categoryLabel } from "@/data/catalog"
import { optionCounts } from "@/domain/filters"
import { todayKey } from "@/domain/calendar"
import { formatAmount, formatSignedAmount } from "@/domain/format"
import { LEDGER_FILTER_KEYS, matchEntry, type LedgerFilterKey } from "@/domain/ledger"
import type { LedgerEntry } from "@/domain/types"
import { DisplayPopover, DisplayRow, DisplaySelect } from "@/features/shell/display-controls"
import { FilterChips, FilterMenu, type FilterField } from "@/features/shell/filter-controls"
import { FilterBar, PageFrame } from "@/features/shell/page-frame"
import { downloadCsv } from "@/lib/csv"
import { focusRing } from "@/lib/styles"
import { useFilters } from "@/state/url-state"
import { useProjectsById, useToday } from "@/state/hooks"
import { usePrefs } from "@/state/prefs"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { categoryField, channelField, entryStatusField, projectField } from "../common/filter-fields"
import { EntryRow } from "./entry-row"
import { LEDGER_GROUP_OPTIONS, groupLedger, type LedgerGroup } from "./ledger-groups"

const VALUE_OF: Record<LedgerFilterKey, (entry: LedgerEntry) => string[]> = {
  kind: (entry) => [entry.kind],
  project: (entry) => [entry.projectId ?? "none"],
  channel: (entry) => [entry.channel],
  category: (entry) => [entry.category],
  status: (entry) => [entry.status],
}

type Scope = "all" | "income" | "expense"

function GroupSection({ group, collapsed, onToggle }: { group: LedgerGroup; collapsed: boolean; onToggle(): void }) {
  const projectsById = useProjectsById()
  const today = useToday()
  const project = group.projectId ? projectsById.get(group.projectId) : undefined
  const headingId = `ledger-${group.key}`

  return (
    <section aria-labelledby={headingId}>
      <div className="sticky top-0 z-10 flex h-9 min-w-0 items-center gap-2 border-b border-line bg-raised pr-4 pl-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className={cn("flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sm hover:bg-hover", focusRing)}
        >
          <ChevronRight
            aria-hidden
            className={cn("size-3.5 shrink-0 text-fg-3 transition-transform duration-(--dur-fast)", !collapsed && "rotate-90")}
          />
          {group.key === "pending" && <StatusIcon glyph={ENTRY_STATUS.pending.glyph} tone={ENTRY_STATUS.pending.tone} />}
          {project && <ProjectMark name={project.name} color={project.color} size={16} />}
          <span id={headingId} className="truncate font-medium">
            {group.label}
          </span>
          <span className="text-fg-2 tabular">{group.items.length}</span>
        </button>
        <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-fg-2 tabular">
          {group.key === "pending" ? (
            <span>
              还有 <span className="text-fg">{formatAmount(group.pending)}</span> 在路上
            </span>
          ) : (
            <>
              <span className="hidden sm:inline">收入 {formatAmount(group.income)}</span>
              <span className="hidden sm:inline">支出 {formatAmount(group.expense)}</span>
              <span>
                净 <span className={cn("text-fg", group.net < 0 && "text-bad")}>{formatSignedAmount(group.net)}</span>
              </span>
            </>
          )}
        </span>
      </div>
      {!collapsed && (
        <div>
          {group.items.map((entry) => (
            <EntryRow key={entry.id} entry={entry} project={projectsById.get(entry.projectId ?? "")} today={today} />
          ))}
        </div>
      )}
    </section>
  )
}

/** 收支流水：待到账放最上面，其余按月（或副业、分类）分组，每组标出收入、支出和净收入 */
export function LedgerPage() {
  const ledger = useWorkbench((state) => state.ledger)
  const projects = useWorkbench((state) => state.projects)
  const prefs = usePrefs((state) => state.ledger)
  const setPrefs = usePrefs((state) => state.set)
  const openEntryForm = useUi((state) => state.openEntryForm)
  const today = useToday()
  const projectsById = useProjectsById()
  const { filters, toggle, setValues, clearAll } = useFilters(LEDGER_FILTER_KEYS)
  const [toggled, setToggled] = useState<Set<string>>(new Set())

  const kinds = filters.kind ?? []
  const scope: Scope = kinds.length === 1 ? (kinds[0] as Scope) : "all"
  const visible = useMemo(() => ledger.filter((entry) => matchEntry(entry, filters)), [ledger, filters])
  const groups = useMemo(() => groupLedger(visible, prefs.groupBy, projects, today), [visible, prefs.groupBy, projects, today])
  const sum = useMemo(
    () =>
      visible.reduce(
        (acc, entry) => {
          if (entry.status !== "received") return acc
          if (entry.kind === "income") acc.income += entry.amount
          else acc.expense += entry.amount
          return acc
        },
        { income: 0, expense: 0 }
      ),
    [visible]
  )

  const fields: FilterField[] = useMemo(
    () =>
      [projectField(projects), categoryField(), channelField(), entryStatusField()].map((field) => {
        const key = field.key as LedgerFilterKey
        return { ...field, counts: optionCounts(ledger, VALUE_OF[key], (entry) => matchEntry(entry, filters, key)) }
      }),
    [ledger, filters, projects]
  )

  const exportCsv = () => {
    const rows = [...visible]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((entry) => [
        entry.date,
        entry.kind === "income" ? "收入" : "支出",
        entry.amount,
        ENTRY_STATUS[entry.status].label,
        entry.projectId ? (projectsById.get(entry.projectId)?.name ?? "") : "个人事务",
        categoryLabel(entry.category),
        CHANNELS[entry.channel].label,
        entry.expectedOn ?? "",
        entry.note,
      ])
    downloadCsv(`收支-${todayKey()}.csv`, ["日期", "类型", "金额", "状态", "副业", "分类", "渠道", "预计到账", "说明"], rows)
    toast.success(`已导出 ${rows.length} 笔`)
  }

  const filterBar = (
    <FilterBar
      left={
        <>
          <FilterMenu fields={fields} filters={filters} onToggle={(key, value) => toggle(key as LedgerFilterKey, value)} />
          <FilterChips
            fields={fields}
            filters={filters}
            onToggle={(key, value) => toggle(key as LedgerFilterKey, value)}
            onClear={(key) => setValues(key as LedgerFilterKey, [])}
            onClearAll={clearAll}
          />
        </>
      }
      right={
        <>
          <span className="hidden items-center gap-3 text-xs text-fg-2 tabular md:flex">
            <span>收入 {formatAmount(sum.income)}</span>
            <span>支出 {formatAmount(sum.expense)}</span>
            <span>
              净 <span className={cn("text-fg", sum.income - sum.expense < 0 && "text-bad")}>{formatSignedAmount(sum.income - sum.expense)}</span>
            </span>
          </span>
          <DisplayPopover onReset={() => setPrefs("ledger", { groupBy: "month" })}>
            <DisplayRow id="ledger-group" label="分组">
              <DisplaySelect
                id="ledger-group"
                value={prefs.groupBy}
                options={LEDGER_GROUP_OPTIONS}
                onChange={(groupBy) => setPrefs("ledger", { groupBy })}
              />
            </DisplayRow>
          </DisplayPopover>
        </>
      }
    />
  )

  return (
    <PageFrame
      title="收支"
      tabs={[
        { key: "all", label: "全部" },
        { key: "income", label: "收入" },
        { key: "expense", label: "支出" },
      ]}
      activeTab={scope}
      onTabChange={(key) => setValues("kind", key === "all" ? [] : [key])}
      actions={
        <>
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={exportCsv} disabled={visible.length === 0}>
            <Download />
            导出
          </Button>
          <Button variant="outline" size="sm" onClick={() => openEntryForm({ mode: "create", preset: scope === "expense" ? { kind: "expense", category: "server" } : undefined })}>
            <Plus />
            记一笔
          </Button>
        </>
      }
      filterBar={filterBar}
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={FilterX}
          title={ledger.length === 0 ? "还没有收支记录" : "没有符合筛选条件的记录"}
          className="h-full"
          action={
            ledger.length === 0 ? (
              <Button variant="outline" size="sm" onClick={() => openEntryForm({ mode: "create" })}>
                记一笔
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={clearAll}>
                清除筛选
              </Button>
            )
          }
        />
      ) : (
        <div className="pb-20 lg:pb-6">
          {groups.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              collapsed={group.collapsed !== toggled.has(group.key)}
              onToggle={() =>
                setToggled((current) => {
                  const next = new Set(current)
                  if (next.has(group.key)) next.delete(group.key)
                  else next.add(group.key)
                  return next
                })
              }
            />
          ))}
        </div>
      )}
    </PageFrame>
  )
}
