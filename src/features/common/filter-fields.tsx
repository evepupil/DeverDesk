import { ArrowDownUp, CalendarDays, CircleDashed, FolderKanban, Landmark, Tag, Zap } from "lucide-react"

import { ProjectMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import {
  CHANNELS,
  CHANNEL_ORDER,
  ENTRY_STATUS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ORDER,
  INCOME_CATEGORIES,
  INCOME_CATEGORY_ORDER,
  PRIORITY,
  PRIORITY_ORDER,
  TASK_STATUS,
  TASK_STATUS_ORDER,
} from "@/data/catalog"
import type { EntryStatus, Project } from "@/domain/types"
import { getT } from "@/i18n/runtime"
import type { FilterField } from "@/features/shell/filter-controls"
import { PriorityIcon } from "./task-bits"

/** 工作台各页共用的筛选字段：名称、图标和可选值都来自数据目录 */

export const taskStatusField = (): FilterField => ({
  key: "status",
  label: getT().common.fields.status,
  icon: CircleDashed,
  options: TASK_STATUS_ORDER.map((status) => ({
    value: status,
    label: TASK_STATUS[status].label,
    icon: <StatusIcon glyph={TASK_STATUS[status].glyph} tone={TASK_STATUS[status].tone} />,
  })),
})

/** 副业：包含「个人事务」（没有归到任何副业的记录） */
export const projectField = (projects: Project[]): FilterField => ({
  key: "project",
  label: getT().common.fields.project,
  icon: FolderKanban,
  options: [
    ...projects.map((project) => ({
      value: project.id,
      label: project.name,
      icon: <ProjectMark name={project.name} color={project.color} size={14} />,
    })),
    { value: "none", label: getT().common.personal },
  ],
})

export const priorityField = (): FilterField => ({
  key: "priority",
  label: getT().common.fields.priority,
  icon: Zap,
  options: PRIORITY_ORDER.map((priority) => ({
    value: String(priority),
    label: PRIORITY[priority].label,
    icon: <PriorityIcon priority={priority} />,
  })),
})

export const planField = (): FilterField => ({
  key: "plan",
  label: getT().common.fields.plan,
  icon: CalendarDays,
  options: [
    { value: "today", label: getT().common.fields.planOptions.today },
    { value: "week", label: getT().common.fields.planOptions.week },
    { value: "unplanned", label: getT().common.fields.planOptions.unplanned },
    { value: "overdue", label: getT().common.fields.planOptions.overdue },
  ],
})

export const kindField = (): FilterField => ({
  key: "kind",
  label: getT().common.fields.kind,
  icon: ArrowDownUp,
  options: [
    { value: "income", label: getT().common.fields.income },
    { value: "expense", label: getT().common.fields.expense },
  ],
})

export const channelField = (): FilterField => ({
  key: "channel",
  label: getT().common.fields.channel,
  icon: Landmark,
  options: CHANNEL_ORDER.map((channel) => ({ value: channel, label: CHANNELS[channel].label })),
})

export const categoryField = (): FilterField => ({
  key: "category",
  label: getT().common.fields.category,
  icon: Tag,
  options: [
    ...INCOME_CATEGORY_ORDER.map((category) => ({ value: category, label: INCOME_CATEGORIES[category].label })),
    ...EXPENSE_CATEGORY_ORDER.map((category) => ({ value: category, label: EXPENSE_CATEGORIES[category].label })),
  ],
})

const ENTRY_STATUS_ORDER: EntryStatus[] = ["pending", "received", "refunded"]

export const entryStatusField = (): FilterField => ({
  key: "status",
  label: getT().common.fields.entryStatus,
  icon: CircleDashed,
  options: ENTRY_STATUS_ORDER.map((status) => ({
    value: status,
    label: ENTRY_STATUS[status].label,
    icon: <StatusIcon glyph={ENTRY_STATUS[status].glyph} tone={ENTRY_STATUS[status].tone} />,
  })),
})
