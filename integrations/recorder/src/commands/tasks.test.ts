import { describe, expect, it, vi } from "vitest"
import { SETTLE_DELAY } from "../core/constants"
import type { ComputedTask, RecorderEvent } from "../core/types"
import { runTasks } from "./tasks"

const now = Date.parse("2025-04-05T12:00:00.000Z")

function task(key: string, dir: string, minutes: number, finishedAt: number): ComputedTask {
  return {
    key,
    agent: "codex",
    session: key,
    dir,
    source: "done",
    title: `Task ${key}`,
    finishedAt,
    commits: [],
    entries: [{ key: `${key}-entry`, start: finishedAt - 60_000, end: finishedAt, minutes }],
  }
}

describe("runTasks", () => {
  it("groups computed tasks, applies --since and writes stable JSON totals", async () => {
    const recentEvent = { v: 1 as const, t: now - 1, agent: "codex" as const, session: "s", dir: "Repo", cwd: "/repo", kind: "done" as const, title: "x" }
    const oldEvent = { ...recentEvent, t: now - 20 * 24 * 60 * 60_000 }
    const compute = vi.fn(() => ({ tasks: [task("a", "Repo", 4, now - 1000), task("b", "Repo", 7, now - 2000), task("c", "Other", 3, now - 3000)] }))
    const readEvents = vi.fn((home: string, opts: { now?: number }) => {
      void home
      void opts
      return [recentEvent, oldEvent] as RecorderEvent[]
    })
    const result = await runTasks({ since: "7d", json: true }, { home: "/tmp/recorder", now, readEvents, compute })
    expect(readEvents).toHaveBeenCalledWith("/tmp/recorder", { now })
    expect(readEvents.mock.results[0]?.value).toHaveLength(2)
    expect(compute).toHaveBeenCalledWith([recentEvent], now + SETTLE_DELAY)
    expect(result.data.groups.map((group) => group.dir)).toEqual(["Repo", "Other"])
    expect(result.data.totalTasks).toBe(3)
    expect(result.data.totalMinutes).toBe(14)
    expect(result.data.notice).toContain("最近 15 分钟")
    expect(result.output).toBe(JSON.stringify(result.data, null, 2))
  })

  it("prints the recent-window notice and rejects unsupported --since formats", async () => {
    const result = await runTasks({}, {
      home: "/tmp/recorder",
      now,
      readEvents: () => [],
      compute: () => ({ tasks: [] }),
    })
    expect(result.output).toContain("最近 15 分钟内的可能还会变")
    await expect(runTasks({ since: "3weeks" }, { home: "/tmp/recorder", now, readEvents: () => [], compute: () => ({ tasks: [] }) }))
      .rejects.toMatchObject({ exitCode: 2 })
  })
})
