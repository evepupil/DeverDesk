import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { blankWorkbench } from "@/data/seed"
import { useWorkbench } from "@/state/store"

const FIXED_NOW = new Date(2027, 0, 15, 12, 0, 0)
const TODAY = "2027-01-15"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  useWorkbench.getState().importData(blankWorkbench())
})

afterEach(() => {
  vi.useRealTimers()
})

describe("workbench operation integration", () => {
  it("validates project directory names against all other projects without saving errors", () => {
    const saveProject = useWorkbench.getState().saveProject
    const first = saveProject({ name: "First project", color: "teal", stage: "building", goal: "", monthlyTarget: null, dirNames: ["  Repo "] })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const projectsBefore = useWorkbench.getState().projects
    const duplicate = saveProject({ name: "Second project", color: "blue", stage: "idea", goal: "", monthlyTarget: null, dirNames: ["repo"] })
    expect(duplicate).toEqual({
      ok: false,
      error: { kind: "taken", name: "repo", projectId: first.project.id, projectName: "First project" },
    })
    expect(useWorkbench.getState().projects).toBe(projectsBefore)

    const updated = saveProject({ name: "First project", color: "teal", stage: "running", goal: "", monthlyTarget: null }, first.project.id)
    expect(updated).toMatchObject({ ok: true, project: { dirNames: ["Repo"], stage: "running" } })
  })

  it("keeps task form edits distinct from status changes and preserves planning rules", () => {
    const store = useWorkbench.getState()
    const task = store.createTask({ title: "  First  ", status: "backlog", plannedFor: TODAY, startAt: "09:00" })
    expect(task).toMatchObject({ title: "First", status: "backlog", plannedFor: TODAY, startAt: "09:00", seq: 101 })

    store.updateTask(task.id, { title: "  Edited  ", plannedFor: "2027-01-16" })
    let current = useWorkbench.getState().tasks.find((item) => item.id === task.id)
    expect(current).toMatchObject({ title: "Edited", plannedFor: "2027-01-16", startAt: null, status: "backlog" })

    store.planTask(task.id, TODAY)
    current = useWorkbench.getState().tasks.find((item) => item.id === task.id)
    expect(current).toMatchObject({ status: "todo", plannedFor: TODAY })

    store.scheduleTask(task.id, "10:30")
    current = useWorkbench.getState().tasks.find((item) => item.id === task.id)
    expect(current).toMatchObject({ plannedFor: TODAY, startAt: "10:30" })

    store.setTaskStatus(task.id, "done")
    current = useWorkbench.getState().tasks.find((item) => item.id === task.id)
    expect(current).toMatchObject({ status: "done", completedAt: FIXED_NOW.getTime(), plannedFor: TODAY })
  })

  it("closes the previous timer, ignores short sessions and logs manual time", () => {
    const store = useWorkbench.getState()
    const first = store.createTask({ title: "First" })
    const second = store.createTask({ title: "Second", projectId: "p-1" })

    store.startTimer(first.id)
    vi.advanceTimersByTime(31_000)
    store.startTimer(second.id)
    let current = useWorkbench.getState()
    expect(current.timer).toMatchObject({ taskId: second.id, label: "Second", startedAt: FIXED_NOW.getTime() + 31_000 })
    expect(current.entries).toHaveLength(1)
    expect(current.entries[0]).toMatchObject({ taskId: first.id, start: FIXED_NOW.getTime(), end: FIXED_NOW.getTime() + 31_000 })
    expect(current.tasks.find((task) => task.id === second.id)).toMatchObject({ status: "doing", plannedFor: TODAY })

    vi.advanceTimersByTime(20_000)
    const stopped = useWorkbench.getState().stopTimer()
    expect(stopped).toBeNull()
    current = useWorkbench.getState()
    expect(current.timer).toBeNull()
    expect(current.entries).toHaveLength(1)

    useWorkbench.getState().logTime(second.id, 25)
    current = useWorkbench.getState()
    expect(current.entries[1]).toMatchObject({
      taskId: second.id,
      projectId: "p-1",
      start: FIXED_NOW.getTime() + 51_000 - 25 * 60_000,
      end: FIXED_NOW.getTime() + 51_000,
    })
  })

  it("stops a matching timer when a task is completed and preserves done-at behavior", () => {
    const store = useWorkbench.getState()
    const task = store.createTask({ title: "Focus" })
    store.startTimer(task.id)
    vi.advanceTimersByTime(60_000)
    store.setTaskStatus(task.id, "done")

    const current = useWorkbench.getState()
    expect(current.timer).toBeNull()
    expect(current.tasks.find((item) => item.id === task.id)).toMatchObject({
      status: "done",
      completedAt: FIXED_NOW.getTime() + 60_000,
      plannedFor: TODAY,
    })
    expect(current.entries).toHaveLength(1)
    expect(current.entries[0]).toMatchObject({ taskId: task.id, start: FIXED_NOW.getTime(), end: FIXED_NOW.getTime() + 60_000 })
  })

  it("applies task movement and subtask operations through the store", () => {
    const store = useWorkbench.getState()
    const task = store.createTask({ title: "Parent", plannedFor: TODAY, startAt: "09:00" })
    store.addSubtask(task.id, "  Child  ")
    const subtask = useWorkbench.getState().tasks[0].subtasks[0]
    expect(subtask).toMatchObject({ title: "Child", done: false })

    store.toggleSubtask(task.id, subtask.id)
    expect(useWorkbench.getState().tasks[0].subtasks[0].done).toBe(true)
    store.moveTasksToDay([task.id], "2027-01-16")
    expect(useWorkbench.getState().tasks[0]).toMatchObject({ plannedFor: "2027-01-16", startAt: null })
    store.removeSubtask(task.id, subtask.id)
    expect(useWorkbench.getState().tasks[0].subtasks).toEqual([])
  })

  it("uses shared entry, project, milestone, routine and note rules", () => {
    const store = useWorkbench.getState()
    const entry = store.saveEntry({
      kind: "income",
      amount: 50,
      projectId: null,
      category: "sales",
      channel: "bank",
      status: "pending",
      date: "2027-01-10",
      expectedOn: "2027-01-20",
      note: "Invoice",
    })
    expect(entry).toMatchObject({ id: expect.stringMatching(/^L-/), createdAt: FIXED_NOW.getTime() })
    store.setEntryStatus(entry.id, "received")
    expect(useWorkbench.getState().ledger[0]).toMatchObject({ status: "received", date: TODAY, expectedOn: null })
    const updatedEntry = store.saveEntry({ ...entry, amount: 75 }, entry.id)
    expect(updatedEntry.amount).toBe(75)

    const projectResult = store.saveProject({ name: "  Side project  ", color: "teal", stage: "building", goal: "Ship", monthlyTarget: 100 })
    expect(projectResult.ok).toBe(true)
    if (!projectResult.ok) return
    const project = projectResult.project
    expect(project).toMatchObject({ name: "Side project", startedOn: TODAY, milestones: [], dirNames: [] })
    store.addMilestone(project.id, "  Release  ", "2027-02-01")
    const milestone = useWorkbench.getState().projects[0].milestones[0]
    expect(milestone).toMatchObject({ title: "Release", due: "2027-02-01", doneOn: null })
    store.toggleMilestone(project.id, milestone.id)
    expect(useWorkbench.getState().projects[0].milestones[0].doneOn).toBe(TODAY)

    const routine = store.saveRoutine({ title: "  Write  ", cadence: "daily", estimateMin: 20, projectId: project.id })
    expect(routine).toMatchObject({ title: "Write", createdOn: TODAY, archived: false, doneOn: [] })
    store.archiveRoutine(routine.id)
    expect(useWorkbench.getState().routines[0].archived).toBe(true)
    store.restoreRoutine(routine.id)
    expect(useWorkbench.getState().routines[0].archived).toBe(false)

    store.saveNote("2027-01-11", { wins: "Shipped" })
    store.saveNote("2027-01-11", { next: "Review" })
    expect(useWorkbench.getState().notes).toEqual([
      { week: "2027-01-11", wins: "Shipped", improve: "", next: "Review" },
    ])
  })
})
