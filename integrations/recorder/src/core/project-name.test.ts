import { describe, expect, it } from "vitest"
import { dirNameFromFacts, dirNameFromPath } from "./project-name"

describe("dirNameFromFacts", () => {
  it("recognizes ordinary repositories and subfolders", () => {
    expect(dirNameFromFacts("/repo", { commonDir: "/repo/.git", toplevel: "/repo" })).toBe("repo")
    expect(dirNameFromFacts("/repo/src/app", { commonDir: "/repo/.git", toplevel: "/repo" })).toBe("repo")
  })

  it("uses the main repository for a worktree and the submodule top-level", () => {
    expect(dirNameFromFacts("/worktrees/feature", { commonDir: "/main/.git", toplevel: "/worktrees/feature" })).toBe("main")
    expect(dirNameFromFacts("/super/vendor/lib", {
      commonDir: "/super/.git/modules/lib",
      toplevel: "/super/vendor/lib",
      superproject: "/super",
    })).toBe("lib")
  })

  it("recognizes bare repositories and non-git paths", () => {
    expect(dirNameFromFacts("/repos/foo.git", { commonDir: "/repos/foo.git", bare: true })).toBe("foo")
    expect(dirNameFromFacts("C:\\code\\plain\\", {})).toBe("plain")
    expect(dirNameFromFacts("/mnt/c/code/DeverDesk", {})).toBe("DeverDesk")
  })

  it("handles trailing slashes, drive roots, and empty paths", () => {
    expect(dirNameFromFacts("C:\\", {})).toBe("C:")
    expect(dirNameFromPath("C:/")).toBe("C:")
    expect(dirNameFromPath("/repo/subfolder///")).toBe("subfolder")
    expect(dirNameFromPath("")).toBe("")
  })
})

describe("dirNameFromPath", () => {
  it("removes a trailing Claude worktree directory", () => {
    expect(dirNameFromPath("/code/DeverDesk/.claude/worktrees/task-1")).toBe("DeverDesk")
    expect(dirNameFromPath("C:\\code\\DeverDesk\\.claude\\worktrees\\task-1\\")).toBe("DeverDesk")
  })
})
