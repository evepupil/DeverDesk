import {
  CalendarRange,
  ChartColumn,
  FolderKanban,
  ListTodo,
  NotebookPen,
  Repeat,
  Sun,
  Wallet,
  type LucideIcon,
} from "lucide-react"

/** 个人工作台的导航：页面 + 常用视图（带固定筛选的页面地址） */

export type WorkbenchPageKey = "today" | "week" | "tasks" | "projects" | "ledger" | "insights" | "review" | "routines"

export interface WorkbenchPage {
  key: WorkbenchPageKey
  label: string
  path: string
  icon: LucideIcon
  /** 先按 G 再按这个键跳转 */
  goKey: string
}

export const WORKBENCH_PAGES: WorkbenchPage[] = [
  { key: "today", label: "今天", path: "/", icon: Sun, goKey: "t" },
  { key: "week", label: "本周", path: "/week", icon: CalendarRange, goKey: "w" },
  { key: "tasks", label: "任务", path: "/tasks", icon: ListTodo, goKey: "k" },
  { key: "projects", label: "副业", path: "/projects", icon: FolderKanban, goKey: "p" },
  { key: "ledger", label: "收支", path: "/ledger", icon: Wallet, goKey: "l" },
  { key: "insights", label: "概览", path: "/insights", icon: ChartColumn, goKey: "i" },
  { key: "review", label: "回顾", path: "/review", icon: NotebookPen, goKey: "r" },
  { key: "routines", label: "例行", path: "/routines", icon: Repeat, goKey: "h" },
]

export type WorkbenchViewKey = "overdue" | "pending" | "urgent"

export interface WorkbenchView {
  key: WorkbenchViewKey
  label: string
  path: string
  query: Record<string, string>
}

export const WORKBENCH_VIEWS: WorkbenchView[] = [
  { key: "overdue", label: "逾期和延期", path: "/tasks", query: { plan: "overdue" } },
  { key: "urgent", label: "高优先", path: "/tasks", query: { priority: "3,4", status: "todo,doing" } },
  { key: "pending", label: "待到账", path: "/ledger", query: { status: "pending" } },
]

export function viewHref(view: { path: string; query: Record<string, string> }): string {
  return `${view.path}?${new URLSearchParams(view.query).toString()}`
}

function sameValues(a: string | null, b: string) {
  return a !== null && a.split(",").sort().join(",") === b.split(",").sort().join(",")
}

/** 当前高亮哪一行：地址等于某个视图就高亮视图，打开某个副业就高亮那个副业，否则高亮所在页面 */
export function resolveWorkbenchNav(pathname: string, params: URLSearchParams): string {
  const keys = [...params.keys()]
  for (const view of WORKBENCH_VIEWS) {
    if (pathname !== view.path) continue
    const expected = Object.keys(view.query)
    if (keys.length === expected.length && expected.every((key) => sameValues(params.get(key), view.query[key]))) {
      return view.key
    }
  }
  if (pathname === "/projects" && params.get("open")) return `project:${params.get("open")}`
  const page = WORKBENCH_PAGES.find((item) => item.path !== "/" && pathname.startsWith(item.path))
  return page?.key ?? "today"
}
