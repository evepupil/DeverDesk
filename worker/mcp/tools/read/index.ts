// 查情况：八个读工具（get_day、get_week、list_projects、get_project、get_stats、get_week_review、search、query_records）。
import type { ReadTool } from "../../types"
import { getDayTool } from "./get-day"
import { getWeekTool } from "./get-week"
import { listProjectsTool } from "./list-projects"
import { getProjectTool } from "./get-project"
import { getStatsTool } from "./get-stats"
import { getWeekReviewTool } from "./get-week-review"
import { searchTool } from "./search"
import { queryRecordsTool } from "./query-records"

export const readTools: ReadTool<unknown>[] = [
  getDayTool,
  getWeekTool,
  listProjectsTool,
  getProjectTool,
  getStatsTool,
  getWeekReviewTool,
  searchTool,
  queryRecordsTool,
]
