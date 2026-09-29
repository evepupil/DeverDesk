"use client"

import { FilterX, Plus } from "lucide-react"
import { useMemo } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { Segmented } from "@/components/base/segmented"
import { Button } from "@/components/ui/button"
import { optionCounts } from "@/domain/filters"
import {
  TASK_FILTER_KEYS,
  isOpen,
  matchPlanWindow,
  matchTask,
  projectKeyOf,
  sortTasks,
  type PlanWindow,
  type TaskFilterKey,
  type TaskSortBy,
} from "@/domain/tasks"
import type { Task } from "@/domain/types"
import {
  DisplayDivider,
  DisplayPopover,
  DisplayRow,
  DisplaySelect,
  DisplaySwitch,
  PropertyToggles,
} from "@/features/shell/display-controls"
import { FilterChips, FilterMenu, type FilterField } from "@/features/shell/filter-controls"
import { FilterBar, PageFrame } from "@/features/shell/page-frame"
import type { Messages } from "@/i18n/messages/types"
import { useT } from "@/i18n/react"
import { useFilters, useUrlState } from "@/state/url-state"
import { useToday } from "@/state/hooks"
import { usePrefs, type TaskProperty } from "@/state/prefs"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { planField, priorityField, projectField, taskStatusField } from "../common/filter-fields"
import { taskGroupOptions, groupTasks, type TaskGroup } from "./task-groups"
import { TasksBoard } from "./tasks-board"
import { TasksList } from "./tasks-list"

const PLAN_WINDOWS: PlanWindow[] = ["today", "week", "unplanned", "overdue"]

type Scope = "all" | "week" | "unplanned"

/** 排序和卡片属性的可选值：按当前语言取词条 */
function sortOptions(t: Messages): { value: TaskSortBy; label: string }[] {
  return [
    { value: "priority", label: t.tasks.display.sortPriority },
    { value: "due", label: t.tasks.display.sortDue },
    { value: "created", label: t.tasks.display.sortCreated },
    { value: "title", label: t.tasks.display.sortTitle },
  ]
}

function propertyOptions(t: Messages): { value: TaskProperty; label: string }[] {
  return [
    { value: "id", label: t.tasks.display.propertyId },
    { value: "estimate", label: t.tasks.display.propertyEstimate },
    { value: "project", label: t.common.fields.project },
    { value: "priority", label: t.common.fields.priority },
    { value: "plan", label: t.common.fields.plan },
    { value: "due", label: t.tasks.display.propertyDue },
  ]
}

function scopeOptions(t: Messages): { key: Scope; label: string }[] {
  return [
    { key: "all", label: t.tasks.scopes.all },
    { key: "week", label: t.tasks.scopes.week },
    { key: "unplanned", label: t.tasks.scopes.unplanned },
  ]
}

/** 任务：看板或列表，按状态 / 副业 / 优先级分组；筛选条件存在地址栏里 */
export function TasksPage() {
  const t = useT()
  const today = useToday()
  const tasks = useWorkbench((state) => state.tasks)
  const projects = useWorkbench((state) => state.projects)
  const updateTask = useWorkbench((state) => state.updateTask)
  const setTaskStatus = useWorkbench((state) => state.setTaskStatus)
  const prefs = usePrefs((state) => state.tasks)
  const setPrefs = usePrefs((state) => state.set)
  const resetPrefs = usePrefs((state) => state.reset)
  const openTaskForm = useUi((state) => state.openTaskForm)
  const { params, update } = useUrlState()
  const { filters, toggle, setValues, clearAll } = useFilters(TASK_FILTER_KEYS)

  const rawScope = params.get("view")
  const scope: Scope = rawScope === "week" || rawScope === "unplanned" ? rawScope : "all"

  const scoped = useMemo(() => {
    if (scope === "week") return tasks.filter((task) => matchPlanWindow(task, "week", today))
    if (scope === "unplanned") return tasks.filter((task) => isOpen(task) && task.plannedFor === null)
    return tasks
  }, [tasks, scope, today])

  const visible = useMemo(() => scoped.filter((task) => matchTask(task, filters, today)), [scoped, filters, today])

  const groups = useMemo(() => {
    const all = groupTasks(sortTasks(visible, prefs.sortBy), prefs.groupBy, projects)
    // 按某个字段分组、同时又按这个字段筛选时，被筛掉的分组不再占一列
    const filtered = (filters[prefs.groupBy] ?? []).length > 0
    return filtered ? all.filter((group) => group.items.length > 0) : all
  }, [visible, prefs.sortBy, prefs.groupBy, projects, filters])

  const fields: FilterField[] = useMemo(() => {
    const valueOf: Record<TaskFilterKey, (task: Task) => string[]> = {
      status: (task) => [task.status],
      project: (task) => [projectKeyOf(task)],
      priority: (task) => [String(task.priority)],
      plan: (task) => PLAN_WINDOWS.filter((window) => matchPlanWindow(task, window, today)),
    }
    return [taskStatusField(), projectField(projects), priorityField(), planField()].map((field) => {
      const key = field.key as TaskFilterKey
      return { ...field, counts: optionCounts(scoped, valueOf[key], (task) => matchTask(task, filters, today, key)) }
    })
  }, [scoped, filters, projects, today])

  const onDropTask = (taskId: string, group: TaskGroup) => {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return
    const { preset } = group
    if (preset.status !== undefined && preset.status !== task.status) setTaskStatus(taskId, preset.status)
    else if (preset.priority !== undefined && preset.priority !== task.priority) updateTask(taskId, { priority: preset.priority })
    else if ("projectId" in preset && preset.projectId !== undefined && preset.projectId !== task.projectId) {
      updateTask(taskId, { projectId: preset.projectId })
    }
  }

  const filterBar = (
    <FilterBar
      left={
        <>
          <FilterMenu fields={fields} filters={filters} onToggle={(key, value) => toggle(key as TaskFilterKey, value)} />
          <FilterChips
            fields={fields}
            filters={filters}
            onToggle={(key, value) => toggle(key as TaskFilterKey, value)}
            onClear={(key) => setValues(key as TaskFilterKey, [])}
            onClearAll={clearAll}
          />
        </>
      }
      right={
        <>
          <span className="hidden text-xs text-fg-2 tabular sm:inline">{t.tasks.count(visible.length)}</span>
          <Segmented
            label={t.tasks.layout.label}
            value={prefs.layout}
            options={[
              { value: "board", label: t.tasks.layout.board },
              { value: "list", label: t.tasks.layout.list },
            ]}
            onChange={(layout) => setPrefs("tasks", { layout })}
          />
          <DisplayPopover onReset={() => resetPrefs("tasks")}>
            <DisplayRow id="tasks-group" label={t.tasks.display.group}>
              <DisplaySelect
                id="tasks-group"
                value={prefs.groupBy}
                options={taskGroupOptions(t)}
                onChange={(groupBy) => setPrefs("tasks", { groupBy })}
              />
            </DisplayRow>
            <DisplayRow id="tasks-sort" label={t.tasks.display.sort}>
              <DisplaySelect id="tasks-sort" value={prefs.sortBy} options={sortOptions(t)} onChange={(sortBy) => setPrefs("tasks", { sortBy })} />
            </DisplayRow>
            <DisplayRow id="tasks-ended" label={t.tasks.display.showEnded}>
              <DisplaySwitch id="tasks-ended" checked={prefs.showEnded} onChange={(showEnded) => setPrefs("tasks", { showEnded })} />
            </DisplayRow>
            <DisplayDivider />
            <PropertyToggles
              title={t.tasks.display.onCard}
              options={propertyOptions(t)}
              selected={prefs.properties}
              onToggle={(property) =>
                setPrefs("tasks", {
                  properties: prefs.properties.includes(property)
                    ? prefs.properties.filter((item) => item !== property)
                    : [...prefs.properties, property],
                })
              }
            />
          </DisplayPopover>
        </>
      }
    />
  )

  return (
    <PageFrame
      title={t.nav.pages.tasks}
      tabs={scopeOptions(t)}
      activeTab={scope}
      onTabChange={(key) => update({ view: key === "all" ? null : key })}
      actions={
        <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => openTaskForm({ mode: "create" })}>
          <Plus />
          {t.tasks.newTask}
        </Button>
      }
      filterBar={filterBar}
      contentClassName={prefs.layout === "board" && visible.length > 0 ? "overflow-hidden" : undefined}
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={FilterX}
          title={scoped.length === 0 ? (scope === "all" ? t.tasks.empty.all : t.tasks.empty.scope) : t.tasks.empty.filtered}
          className="h-full"
          action={
            scoped.length === 0 ? (
              <Button variant="outline" size="sm" onClick={() => openTaskForm({ mode: "create" })}>
                {t.tasks.newTask}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={clearAll}>
                {t.tasks.clearFilters}
              </Button>
            )
          }
        />
      ) : prefs.layout === "board" ? (
        <TasksBoard groups={groups} today={today} properties={prefs.properties} showEnded={prefs.showEnded} onDropTask={onDropTask} />
      ) : (
        <TasksList groups={groups} today={today} showEnded={prefs.showEnded} onDropTask={onDropTask} />
      )}
    </PageFrame>
  )
}
