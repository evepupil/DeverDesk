// 排时间与管理：七个写工具（update_tasks、plan_day、plan_week、reschedule、manage_project、manage_routine、delete_records）。
import type { WriteTool } from "../../types"
import { updateTasksTool } from "./update-tasks"
import { planDayTool } from "./plan-day"
import { planWeekTool } from "./plan-week"
import { rescheduleTool } from "./reschedule"
import { manageProjectTool } from "./manage-project"
import { manageRoutineTool } from "./manage-routine"
import { deleteRecordsTool } from "./delete-records"

export const planTools: WriteTool<unknown>[] = [
  updateTasksTool,
  planDayTool,
  planWeekTool,
  rescheduleTool,
  manageProjectTool,
  manageRoutineTool,
  deleteRecordsTool,
]
