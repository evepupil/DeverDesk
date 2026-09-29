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
import { useFilters, useUrlState } from "@/state/url-state"
import { useToday } from "@/state/hooks"
import { usePrefs, type TaskProperty } from "@/state/prefs"
import { useWorkbench } from "@/state/store"
import { useUi } from "@/state/ui"
import { planField, priorityField, projectField, taskStatusField } from "../common/filter-fields"
import { TASK_GROUP_OPTIONS, groupTasks, type TaskGroup } from "./task-groups"
import { TasksBoard } from "./tasks-board"
import { TasksList } from "./tasks-list"

const SORT_OPTIONS: { value: TaskSortBy; label: string }[] = [
  { value: "priority", label: "优先级" },
  { value: "due", label: "截止日期" },
  { value: "created", label: "创建时间" },
  { value: "title", label: "名称" },
]

const PROPERTY_OPTIONS: { value: TaskProperty; label: string }[] = [
  { value: "id", label: "编号" },
  { value: "estimate", label: "时长" },
  { value: "project", label: "副业" },
  { value: "priority", label: "优先级" },
  { value: "plan", label: "安排" },
  { value: "due", label: "截止" },
]

const PLAN_WINDOWS: PlanWindow[] = ["today", "week", "unplanned", "overdue"]

type Scope = "all" | "week" | "unplanned"

const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "week", label: "本周" },
  { key: "unplanned", label: "还没安排" },
]

/** 任务：看板或列表，按状态 / 副业 / 优先级分组；筛选条件存在地址栏里 */
export function TasksPage() {
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
          <span className="hidden text-xs text-fg-2 tabular sm:inline">{visible.length} 件</span>
          <Segmented
            label="布局"
            value={prefs.layout}
            options={[
              { value: "board", label: "看板" },
              { value: "list", label: "列表" },
            ]}
            onChange={(layout) => setPrefs("tasks", { layout })}
          />
          <DisplayPopover onReset={() => resetPrefs("tasks")}>
            <DisplayRow id="tasks-group" label="分组">
              <DisplaySelect
                id="tasks-group"
                value={prefs.groupBy}
                options={TASK_GROUP_OPTIONS}
                onChange={(groupBy) => setPrefs("tasks", { groupBy })}
              />
            </DisplayRow>
            <DisplayRow id="tasks-sort" label="排序">
              <DisplaySelect id="tasks-sort" value={prefs.sortBy} options={SORT_OPTIONS} onChange={(sortBy) => setPrefs("tasks", { sortBy })} />
            </DisplayRow>
            <DisplayRow id="tasks-ended" label="显示已结束的分组">
              <DisplaySwitch id="tasks-ended" checked={prefs.showEnded} onChange={(showEnded) => setPrefs("tasks", { showEnded })} />
            </DisplayRow>
            <DisplayDivider />
            <PropertyToggles
              title="卡片上显示"
              options={PROPERTY_OPTIONS}
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
      title="任务"
      tabs={SCOPES}
      activeTab={scope}
      onTabChange={(key) => update({ view: key === "all" ? null : key })}
      actions={
        <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => openTaskForm({ mode: "create" })}>
          <Plus />
          新建任务
        </Button>
      }
      filterBar={filterBar}
      contentClassName={prefs.layout === "board" && visible.length > 0 ? "overflow-hidden" : undefined}
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={FilterX}
          title={scoped.length === 0 ? (scope === "all" ? "还没有任务" : "这里没有任务") : "没有符合筛选条件的任务"}
          className="h-full"
          action={
            scoped.length === 0 ? (
              <Button variant="outline" size="sm" onClick={() => openTaskForm({ mode: "create" })}>
                新建任务
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={clearAll}>
                清除筛选
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
