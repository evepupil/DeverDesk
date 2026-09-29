import type { ReactNode } from "react"

import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import {
  PRIORITY,
  PRIORITY_ORDER,
  PROJECT_STAGE_ENDED,
  TASK_STATUS,
  TASK_STATUS_ENDED,
  TASK_STATUS_ORDER,
} from "@/data/catalog"
import type { Project, Task } from "@/domain/types"
import type { TaskGroupBy } from "@/state/prefs"
import type { TaskInput } from "@/state/store"
import { PriorityIcon } from "../common/task-bits"

export interface TaskGroup {
  key: string
  label: string
  icon: ReactNode
  items: Task[]
  /** 默认收起（已结束一类） */
  collapsed: boolean
  /** 在这一组里新建、或者拖进这一组时要设置的属性 */
  preset: Partial<TaskInput>
}

export const TASK_GROUP_OPTIONS: { value: TaskGroupBy; label: string }[] = [
  { value: "status", label: "状态" },
  { value: "project", label: "副业" },
  { value: "priority", label: "优先级" },
]

/** 按状态、副业或优先级分组；分组顺序固定，组内保持传入的排序 */
export function groupTasks(tasks: Task[], by: TaskGroupBy, projects: Project[]): TaskGroup[] {
  if (by === "status") {
    return TASK_STATUS_ORDER.map((status) => ({
      key: status,
      label: TASK_STATUS[status].label,
      icon: <StatusIcon glyph={TASK_STATUS[status].glyph} tone={TASK_STATUS[status].tone} />,
      items: tasks.filter((task) => task.status === status),
      collapsed: TASK_STATUS_ENDED.includes(status),
      preset: { status },
    }))
  }

  if (by === "priority") {
    return PRIORITY_ORDER.map((priority) => ({
      key: String(priority),
      label: PRIORITY[priority].label,
      icon: <PriorityIcon priority={priority} />,
      items: tasks.filter((task) => task.priority === priority),
      collapsed: false,
      preset: { priority },
    }))
  }

  const groups: TaskGroup[] = projects.map((project) => ({
    key: project.id,
    label: project.name,
    icon: <ProjectMark name={project.name} color={project.color} size={16} />,
    items: tasks.filter((task) => task.projectId === project.id),
    collapsed: PROJECT_STAGE_ENDED.includes(project.stage),
    preset: { projectId: project.id },
  }))
  groups.push({
    key: "none",
    label: "个人事务",
    icon: <span aria-hidden className="size-4 shrink-0 rounded-[4px] border border-dashed border-line-3" />,
    items: tasks.filter((task) => task.projectId === null),
    collapsed: false,
    preset: { projectId: null },
  })
  // 没有任务的已结束副业不占位置
  return groups.filter((group) => !group.collapsed || group.items.length > 0)
}
