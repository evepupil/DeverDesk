import { beforeAll, describe, expect, it } from "vitest"

declare const process: { env: Record<string, string | undefined> }
import type { Project, Routine, Task } from "../../../../src/domain/types"
import type { DataSource, Versioned } from "../../types"
import { ToolInputError } from "../../types"
import { parseTaskCode, resolveProject, resolveRoutine, resolveTasks } from "./refs"
import { PROJECT_REF, ROUTINE_REF, TASK_REF } from "./schema"

beforeAll(() => {
  process.env.TZ = "UTC"
})

function task(id: string, seq: number, title: string): Task {
  return {
    id,
    seq,
    title,
    projectId: null,
    status: "todo",
    priority: 2,
    estimateMin: 30,
    plannedFor: null,
    startAt: null,
    dueOn: null,
    notes: "",
    subtasks: [],
    createdAt: 0,
    completedAt: null,
  }
}

function project(id: string, name: string): Project {
  return { id, name, color: "blue", stage: "running", goal: "", startedOn: "2026-01-01", monthlyTarget: null, milestones: [] }
}

function routine(id: string, title: string): Routine {
  return { id, title, cadence: "daily", estimateMin: 15, projectId: null, doneOn: [], createdOn: "2026-01-01", archived: false }
}

function versioned<T>(value: T): Versioned<T> {
  return { value, updatedAt: 1, rev: 1 }
}

function inputErrorOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof ToolInputError) return error.message
    throw error
  }
  throw new Error("expected ToolInputError")
}

async function rejectsWithInputError(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    if (error instanceof ToolInputError) return error.message
    throw error
  }
  throw new Error("expected ToolInputError")
}

describe("parseTaskCode", () => {
  it("显示编号不限大小写", () => {
    expect(parseTaskCode("T-123")).toBe(123)
    expect(parseTaskCode("t-123")).toBe(123)
    expect(parseTaskCode("T-0")).toBe(0)
  })

  it("其余都返回 null：内部编号、裸数字、带空格尾巴的编号不算", () => {
    for (const ref of ["t-abc", "123", "T123", "T-", "task-1", "T-12a"]) {
      expect(parseTaskCode(ref)).toBeNull()
    }
  })
})

describe("resolveTasks", () => {
  /** 最小数据源替身：只按内部编号或显示编号查（先按编号集合粗查，再在结果里精确匹配） */
  function dataWith(tasks: Task[]): DataSource {
    const all = tasks.map(versioned)
    return {
      profile: () => Promise.resolve({ value: null, updatedAt: null, rev: null }),
      timer: () => Promise.resolve({ value: null, updatedAt: null, rev: null }),
      projects: () => Promise.resolve([]),
      routines: () => Promise.resolve([]),
      notes: () => Promise.resolve([]),
      entries: () => Promise.resolve([]),
      ledger: () => Promise.resolve([]),
      record: () => Promise.resolve(null),
      tasks(query) {
        const matched = all.filter(
          (item) =>
            (query.ids ?? []).includes(item.value.id) || (query.seqs ?? []).includes(item.value.seq)
        )
        return Promise.resolve(matched)
      },
    }
  }

  const store = [task("t-alpha", 101, "Alpha"), task("t-beta", 102, "Beta")]

  it("rejects blank references and declares minimum lengths for task and routine refs", async () => {
    expect(TASK_REF.minLength).toBe(1)
    expect(ROUTINE_REF.minLength).toBe(1)
    for (const ref of ["", "   "]) {
      expect(await rejectsWithInputError(() => resolveTasks(dataWith(store), [ref]))).toBe("Task reference must not be empty.")
      expect(inputErrorOf(() => resolveRoutine(ref, []))).toBe("Routine reference must not be empty.")
    }
  })

  it("reports every internal id when a display code is ambiguous", async () => {
    const duplicates = [task("task-z", 123, "Z"), task("task-a", 123, "A")]
    expect(await rejectsWithInputError(() => resolveTasks(dataWith(duplicates), ["T-123"]))).toBe(
      'Ambiguous task reference "T-123": display code matches multiple tasks (task-a, task-z). Use an internal id instead.'
    )
  })

  it("内部编号和显示编号（混着、大小写不限）都能找到，键是传入的原样引用", async () => {
    const result = await resolveTasks(dataWith(store), ["t-alpha", "T-102", "t-BETA".replace("BETA", "beta")])
    expect([...result.keys()]).toEqual(["t-alpha", "T-102", "t-beta"])
    expect(result.get("t-alpha")?.value.seq).toBe(101)
    expect(result.get("T-102")?.value.seq).toBe(102)
  })

  it("找不到就抛 ToolInputError，写明哪几个找不到", async () => {
    const error = await rejectsWithInputError(() => resolveTasks(dataWith(store), ["t-alpha", "T-999", "t-nope"]))
    expect(error).toBe("Task(s) not found: T-999, t-nope.")
  })

  it("不存在的显示编号走 seqs 查询而不是按内部编号", async () => {
    const queried: string[] = []
    const source = dataWith(store)
    const spy: DataSource = {
      ...source,
      tasks(query) {
        queried.push(`ids=${(query.ids ?? []).join("|")} seqs=${(query.seqs ?? []).join("|")}`)
        return source.tasks(query)
      },
    }
    await resolveTasks(spy, ["T-101"])
    expect(queried).toEqual(["ids= seqs=101"])
  })
})

describe("resolveProject", () => {
  const projects = [project("p-blog", "Blog"), project("p-blog-2", "Blog Ideas"), project("p-app", "Side App")].map(versioned)

  it("没给返回 undefined，null 返回 null", () => {
    expect(resolveProject(undefined, projects)).toBeUndefined()
    expect(resolveProject(null, projects)).toBeNull()
    expect(resolveProject("", projects)).toBeNull()
    expect(resolveProject(" \t ", projects)).toBeNull()
    expect(PROJECT_REF.type).toEqual(["string", "null"])
  })

  it("第一步：内部编号完全相同", () => {
    expect(resolveProject("p-app", projects)?.value.name).toBe("Side App")
  })

  it("第二步：名称不分大小写完全相同", () => {
    expect(resolveProject("side app", projects)?.value.id).toBe("p-app")
    expect(resolveProject("BLOG", projects)?.value.id).toBe("p-blog")
  })

  it("第三步：唯一的开头匹配", () => {
    expect(resolveProject("blog i", projects)?.value.id).toBe("p-blog-2")
  })

  it("第四步：唯一的包含匹配", () => {
    expect(resolveProject("app", projects)?.value.id).toBe("p-app")
    expect(resolveProject("IDEAS", projects)?.value.id).toBe("p-blog-2")
  })

  it("某一步匹配到多个就报歧义并列出候选名称", () => {
    // 完全相同的名字有两个 → 歧义
    const twoBlogs = [project("p-1", "Blog"), project("p-2", "blog")].map(versioned)
    expect(inputErrorOf(() => resolveProject("blog", twoBlogs))).toBe(
      'Ambiguous project reference "blog": matches multiple records (Blog, blog). Use the exact name or the internal id instead.'
    )
    // 包含匹配撞上多个（「p-blog」是 p-blog 和 p-blog-2 的内部编号前缀，内部编号走「完全相同」这一步不会歧义，
    // 但查询 "blog ide" 会同时命中 Blog Ideas 的开头匹配和…… 这里用「a」同时是 Blog Ideas 和 Side App 的子串）
    expect(inputErrorOf(() => resolveProject("a", projects))).toBe(
      'Ambiguous project reference "a": matches multiple records (Blog Ideas, Side App). Use the exact name or the internal id instead.'
    )
  })

  it("全都匹配不到就报找不到并列出现有的", () => {
    expect(inputErrorOf(() => resolveProject("nope", projects))).toBe(
      'Project not found: "nope" (existing: Blog, Blog Ideas, Side App).'
    )
    const none: Versioned<Project>[] = []
    expect(inputErrorOf(() => resolveProject("nope", none))).toBe('Project not found: "nope" (none exist).')
  })

  it("「已结束」的副业也参与匹配", () => {
    const ended = [project("p-old", "Old"), project("p-new", "New")].map(versioned)
    ended[0].value.stage = "ended"
    expect(resolveProject("old", ended)?.value.id).toBe("p-old")
  })
})

describe("resolveRoutine", () => {
  const routines = [routine("r-standup", "Morning standup"), routine("r-weekly", "Weekly review"), routine("r-inbox", "Review inbox")].map(versioned)

  it("内部编号、标题不分大小写完全相同", () => {
    expect(resolveRoutine("r-weekly", routines)?.value.title).toBe("Weekly review")
    expect(resolveRoutine("morning standup", routines)?.value.id).toBe("r-standup")
    expect(resolveRoutine("MORNING STANDUP", routines)?.value.id).toBe("r-standup")
  })

  it("唯一的开头匹配、唯一的包含匹配", () => {
    expect(resolveRoutine("weekly", routines)?.value.id).toBe("r-weekly")
    expect(resolveRoutine("inbox", routines)?.value.id).toBe("r-inbox")
  })

  it("歧义报错列出候选（例行用标题）", () => {
    const twins = [routine("r-1", "Review"), routine("r-2", "review")].map(versioned)
    expect(inputErrorOf(() => resolveRoutine("review", twins))).toBe(
      'Ambiguous routine reference "review": matches multiple records (Review, review). Use the exact name or the internal id instead.'
    )
    // 包含匹配撞上多个（「view」不是任何标题的开头，但同时是 Weekly review 和 Review inbox 的子串）
    expect(inputErrorOf(() => resolveRoutine("view", routines))).toBe(
      'Ambiguous routine reference "view": matches multiple records (Weekly review, Review inbox). Use the exact name or the internal id instead.'
    )
  })

  it("rejects blank routine references before attempting name matching", () => {
    expect(inputErrorOf(() => resolveRoutine("", routines))).toBe("Routine reference must not be empty.")
    expect(inputErrorOf(() => resolveRoutine("  ", routines))).toBe("Routine reference must not be empty.")
  })

  it("找不到报错列出现有的", () => {
    expect(inputErrorOf(() => resolveRoutine("jog", routines))).toBe(
      'Routine not found: "jog" (existing: Morning standup, Weekly review, Review inbox).'
    )
  })
})
