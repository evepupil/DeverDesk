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

import { getT } from "@/i18n/runtime"

/** 个人工作台的导航：页面 + 常用视图（带固定筛选的页面地址）。名字按当前语言从词条现取 */

export type WorkbenchPageKey = "today" | "week" | "tasks" | "projects" | "ledger" | "insights" | "review" | "routines"

export interface WorkbenchPage {
  key: WorkbenchPageKey
  readonly label: string
  path: string
  icon: LucideIcon
  /** 先按 G 再按这个键跳转 */
  goKey: string
}

function page(key: WorkbenchPageKey, path: string, icon: LucideIcon, goKey: string): WorkbenchPage {
  return {
    key,
    get label() {
      return getT().nav.pages[key]
    },
    path,
    icon,
    goKey,
  }
}

export const WORKBENCH_PAGES: WorkbenchPage[] = [
  page("today", "/", Sun, "t"),
  page("week", "/week", CalendarRange, "w"),
  page("tasks", "/tasks", ListTodo, "k"),
  page("projects", "/projects", FolderKanban, "p"),
  page("ledger", "/ledger", Wallet, "l"),
  page("insights", "/insights", ChartColumn, "i"),
  page("review", "/review", NotebookPen, "r"),
  page("routines", "/routines", Repeat, "h"),
]

export type WorkbenchViewKey = "overdue" | "pending" | "urgent"

export interface WorkbenchView {
  key: WorkbenchViewKey
  readonly label: string
  path: string
  query: Record<string, string>
}

function view(key: WorkbenchViewKey, path: string, query: Record<string, string>): WorkbenchView {
  return {
    key,
    get label() {
      return getT().nav.views[key]
    },
    path,
    query,
  }
}

export const WORKBENCH_VIEWS: WorkbenchView[] = [
  view("overdue", "/tasks", { plan: "overdue" }),
  view("urgent", "/tasks", { priority: "3,4", status: "todo,doing" }),
  view("pending", "/ledger", { status: "pending" }),
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
