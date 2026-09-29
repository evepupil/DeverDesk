import type { LedgerEntry, Project, Task } from "./types"

/** 全局搜索：任务按编号和标题、副业按名称和目标、收支按说明和金额 */

function isEnded(task: Task) {
  return task.status === "done" || task.status === "dropped"
}

/** 编号完全相同排最前，其次标题开头相同、标题包含、备注包含；没做完的排在做完的前面 */
export function searchTasks(tasks: Task[], q: string, limit = 8): Task[] {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const hits: { task: Task; score: number }[] = []
  for (const task of tasks) {
    const id = task.id.toLowerCase()
    const title = task.title.toLowerCase()
    let score = -1
    if (id === query || id === `t-${query}`) score = 0
    else if (title.startsWith(query)) score = 1
    else if (title.includes(query)) score = 2
    else if (task.notes.toLowerCase().includes(query)) score = 3
    if (score >= 0) hits.push({ task, score })
  }
  return hits
    .sort(
      (a, b) =>
        a.score - b.score || Number(isEnded(a.task)) - Number(isEnded(b.task)) || b.task.seq - a.task.seq
    )
    .slice(0, limit)
    .map((hit) => hit.task)
}

export function searchProjects(projects: Project[], q: string): Project[] {
  const query = q.trim().toLowerCase()
  if (!query) return []
  return projects.filter(
    (project) => project.name.toLowerCase().includes(query) || project.goal.toLowerCase().includes(query)
  )
}

/** 输入纯数字时也按金额找，方便核对某一笔 */
export function searchLedger(entries: LedgerEntry[], q: string, limit = 6): LedgerEntry[] {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const numeric = query.replace(/[¥,，\s]/g, "")
  const amount = /^\d+(\.\d{1,2})?$/.test(numeric) ? Number(numeric) : null
  return entries
    .filter((entry) => entry.note.toLowerCase().includes(query) || (amount !== null && entry.amount === amount))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
}
