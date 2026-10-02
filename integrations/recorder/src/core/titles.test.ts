import { describe, expect, it } from "vitest"
import { cleanCommitSubject, fallbackTitle, taskSeqFromCommit } from "./titles"
import type { CommitEvent, RecorderEvent } from "./types"

const base = { v: 1 as const, agent: "claude-code" as const, session: "s", dir: "repo", cwd: "/repo" }

function commit(subject: string, body = ""): Pick<CommitEvent, "subject" | "body"> {
  return { subject, body }
}

describe("commit titles and task references", () => {
  it.each([
    ["feat(api)!: 加重试", "加重试"],
    ["Fix: bug", "bug"],
    ["wip", "wip"],
    ["revert: x", "x"],
    ["build(system): prepare release", "prepare release"],
  ])("cleans %s", (subject, expected) => {
    expect(cleanCommitSubject(subject)).toBe(expected)
  })

  it("truncates to 80 characters and keeps an empty-prefix subject intact", () => {
    expect([...cleanCommitSubject(`chore: ${"x".repeat(100)}`)]).toHaveLength(80)
    expect(cleanCommitSubject("feat: ")).toBe("feat: ")
  })

  it("extracts references only from the first line or an eligible body line", () => {
    expect(taskSeqFromCommit(commit("feat: x (Closes T-123)", ""))).toBe(123)
    expect(taskSeqFromCommit(commit("feat: x", "intro\nRefs T-9\nmore"))).toBe(9)
    expect(taskSeqFromCommit(commit("feat: x", "ordinary prose T-5\nmore ordinary prose T-7"))).toBeUndefined()
    expect(taskSeqFromCommit(commit("feat: x", "Refs T-not-a-number\nFixes T-"))).toBeUndefined()
    expect(taskSeqFromCommit(commit("feat: x", "done: T-8\nDone T-10"))).toBe(8)
    expect(taskSeqFromCommit(commit("feat: x", "ClosesT-11\n完成了 T-12"))).toBe(11)
    expect(taskSeqFromCommit(commit("feat: x", "Fixes: T-1234567\nRefs  T-13"))).toBe(13)
    expect(taskSeqFromCommit(commit("feat: x", "完成x T-14\nClosesmore T-15"))).toBeUndefined()
  })
})

describe("fallbackTitle", () => {
  it("takes the first nonempty prompt sentence and truncates at 40 characters", () => {
    const events: RecorderEvent[] = [
      { ...base, kind: "prompt", t: 0, text: "   " },
      { ...base, kind: "prompt", t: 60_000, text: `${"排查构建".repeat(15)}。后续内容` },
    ]
    const title = fallbackTitle(events, 0, 2 * 60_000)
    expect([...title]).toHaveLength(40)
    expect(title.endsWith("…")).toBe(true)
  })

  it("skips empty punctuation fragments before the first meaningful sentence", () => {
    const events: RecorderEvent[] = [{ ...base, kind: "prompt", t: 0, text: "。 ？！先做这件事。后续" }]
    expect(fallbackTitle(events, 0, 1_000)).toBe("先做这件事")
  })

  it("does not split dotted paths or URLs into separate sentences", () => {
    const text = "Check https://x.y/v2 now"
    const events: RecorderEvent[] = [{ ...base, kind: "prompt", t: 0, text }]
    expect(fallbackTitle(events, 0, 1_000)).toBe(text)
  })

  it("uses a UTC English placeholder when no prompt has content", () => {
    const events: RecorderEvent[] = [{ ...base, kind: "prompt", t: 0, text: " 。 " }]
    expect(fallbackTitle(events, Date.UTC(2025, 0, 1, 9, 7), Date.UTC(2025, 0, 1, 11, 42))).toBe("Coding 09:07–11:42")
  })
})
