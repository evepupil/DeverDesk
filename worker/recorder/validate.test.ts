import { describe, expect, it } from "vitest"
import { validateLiveRequest, validateUploadRequest } from "./validate"

const client = { name: "Recorder", version: "1.0", agent: "codex" }
const NOW = 1_760_000_000_000
const UPLOAD_START = Date.UTC(2000, 0, 1)
const UPLOAD_END = NOW + 24 * 60 * 60_000
const task = {
  key: "repo:session:done",
  dir: "Repo",
  title: "Implement feature",
  source: "done",
  finishedAt: NOW,
  commits: [{ sha: "0123456789abcdef", subject: "Finish feature" }],
  entries: [{ key: "repo:session:0", start: NOW - 120_000, end: NOW, minutes: 2 }],
}

function validateUpload(value: unknown) {
  return validateUploadRequest(value, NOW)
}

describe("recorder request validation", () => {
  it("accepts a valid upload and trims task titles", () => {
    const result = validateUpload({ client, tasks: [{ ...task, title: "  Implement feature  " }] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.tasks[0].title).toBe("Implement feature")
  })

  it.each([
    ["key", ""],
    ["dir", ""],
    ["title", "  "],
    ["source", "unknown"],
    ["finishedAt", Number.POSITIVE_INFINITY],
    ["commits", [{ sha: "xyz", subject: "bad sha" }]],
    ["commits", [{ sha: "a".repeat(6), subject: "short sha" }]],
    ["commits", [{ sha: "01234567", subject: "S".repeat(201) }]],
    ["taskSeq", 0],
    ["entries", [{ key: "e", start: 2, end: 1, minutes: 1 }]],
    ["entries", [{ key: "e", start: NOW - 48 * 60 * 60_000 - 1, end: NOW, minutes: 1 }]],
    ["entries", [{ key: "e", start: 1, end: 2, minutes: 0 }]],
    ["entries", [{ key: "e", start: NOW - 1000, end: NOW, minutes: 1_441 }]],
  ])("rejects invalid task field %s", (field, value) => {
    const input = { ...task, [field]: value }
    const result = validateUpload({ client, tasks: [input] })
    expect(result.ok).toBe(false)
  })

  it("clamps finishedAt and accepts the exact lower time and maximum duration boundaries", () => {
    const bounded = validateUpload({ client, tasks: [{
      ...task,
      finishedAt: -Number.MAX_VALUE,
      entries: [{ key: "epoch", start: UPLOAD_START, end: UPLOAD_START + 60_000, minutes: 2 }],
    }] })
    expect(bounded).toMatchObject({
      ok: true,
      value: { tasks: [{ finishedAt: UPLOAD_START, entries: [{ start: UPLOAD_START, end: UPLOAD_START + 60_000, minutes: 2 }] }] },
    })

    const maxDuration = validateUpload({ client, tasks: [{
      ...task,
      entries: [{ key: "long", start: NOW - 48 * 60 * 60_000, end: NOW, minutes: 2_881 }],
    }] })
    expect(maxDuration.ok).toBe(true)
  })

  it("clamps finishedAt but rejects entry timestamps outside the upload window", () => {
    const beforeWindow = validateUpload({ client, tasks: [{ ...task, finishedAt: UPLOAD_START - 1 }] })
    expect(beforeWindow.ok).toBe(true)
    if (beforeWindow.ok) expect(beforeWindow.value.tasks[0]?.finishedAt).toBe(UPLOAD_START)

    const afterWindow = validateUpload({ client, tasks: [{ ...task, finishedAt: Number.MAX_VALUE }] })
    expect(afterWindow.ok).toBe(true)
    if (afterWindow.ok) expect(afterWindow.value.tasks[0]?.finishedAt).toBe(UPLOAD_END)

    for (const [field, value] of [
      ["start", UPLOAD_START - 1],
      ["start", Number.MAX_VALUE],
      ["end", UPLOAD_END + 1],
    ] as const) {
      const entry = { ...task.entries[0], [field]: value }
      const result = validateUpload({ client, tasks: [{ ...task, entries: [entry] }] })
      expect(result).toMatchObject({ ok: false, error: `tasks[0].entries[0].${field} 必须位于 2000-01-01 至未来 24 小时内` })
    }
  })

  it("enforces upload, entry, and commit count limits and unique stable keys", () => {
    expect(validateUpload({ client, tasks: Array.from({ length: 11 }, (_, index) => ({ ...task, key: `k-${index}` })) }).ok).toBe(false)
    expect(validateUpload({ client, tasks: [{ ...task, entries: Array(21).fill(task.entries[0]) }] }).ok).toBe(false)
    expect(validateUpload({ client, tasks: [{ ...task, commits: Array(21).fill(task.commits[0]) }] }).ok).toBe(false)
    expect(validateUpload({ client, tasks: [task, task] }).ok).toBe(false)
    expect(validateUpload({ client, tasks: [{ ...task, entries: [task.entries[0], task.entries[0]] }] }).ok).toBe(false)
  })

  it("validates live windows and the twenty-window/session-key limits", () => {
    const windows = [{ session: "session-1", dir: "Repo", agent: "codex", since: NOW - 48 * 60 * 60_000, minutes: 0 }]
    expect(validateLiveRequest({ windows }, NOW)).toEqual({ ok: true, value: { windows } })
    expect(validateLiveRequest({ windows: Array.from({ length: 21 }, (_, index) => ({ ...windows[0], session: `s-${index}` })) }, NOW).ok).toBe(false)
    expect(validateLiveRequest({ windows: [windows[0], windows[0]] }, NOW).ok).toBe(false)
    expect(validateLiveRequest({ windows: [{ ...windows[0], since: Number.NaN }] }, NOW).ok).toBe(false)
    expect(validateLiveRequest({ windows: [{ ...windows[0], minutes: Number.NaN }] }, NOW).ok).toBe(false)
    expect(validateLiveRequest({ windows: [{ ...windows[0], since: 0, minutes: 5_000 }] }, NOW).ok).toBe(true)
    expect(validateLiveRequest({ windows: [{ ...windows[0], since: 0, minutes: 5_000 }] }, NOW)).toMatchObject({
      ok: true, value: { windows: [{ since: NOW - 48 * 60 * 60_000, minutes: 2_880 }] },
    })
    expect(validateLiveRequest({ windows: [{ ...windows[0], since: NOW + 60 * 60_000 + 1, minutes: -1 }] }, NOW)).toMatchObject({
      ok: true, value: { windows: [{ since: NOW + 60 * 60_000, minutes: 0 }] },
    })
  })
})
