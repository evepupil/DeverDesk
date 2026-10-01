// 随手记：六个写工具（add_tasks、add_ledger_entries、log_time、timer、check_routine、write_week_notes）。
import type { WriteTool } from "../../types"
import { addTasksTool } from "./add-tasks"
import { addLedgerEntriesTool } from "./add-ledger-entries"
import { logTimeTool } from "./log-time"
import { timerTool } from "./timer"
import { checkRoutineTool } from "./check-routine"
import { writeWeekNotesTool } from "./write-week-notes"

export const captureTools: WriteTool<unknown>[] = [
  addTasksTool,
  addLedgerEntriesTool,
  logTimeTool,
  timerTool,
  checkRoutineTool,
  writeWeekNotesTool,
]
