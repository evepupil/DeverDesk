import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createDirNameResolver, resolveDirName } from "./resolve-project"
import { createGitRunner } from "./runner"
import type { GitRunner } from "../core/types"

const temporaryDirectories: string[] = []
const runner = createGitRunner()

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-git-project-"))
  temporaryDirectories.push(directory)
  return directory
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim()
}

function initRepo(path: string): void {
  mkdirSync(path, { recursive: true })
  git(path, "init", "--quiet")
  git(path, "config", "user.name", "Recorder Test")
  git(path, "config", "user.email", "recorder@example.test")
}

function initialCommit(path: string): void {
  writeFileSync(join(path, "README.md"), "# test\n")
  git(path, "add", "README.md")
  git(path, "commit", "--quiet", "-m", "initial")
}

describe("git runner and project resolution", () => {
  it("returns command results without throwing and respects cwd/timeout options", async () => {
    const path = makeTempDir()
    const ok = await runner.run(["rev-parse", "--show-toplevel"], path, { timeoutMs: 2000 })
    expect(ok.ok).toBe(false)
    expect(ok.stdout).toBe("")
    expect(typeof ok.stderr).toBe("string")
  })

  it("resolves a normal repository from a nested working directory", async () => {
    const root = join(makeTempDir(), "normal-project")
    initRepo(root)
    initialCommit(root)
    const nested = join(root, "src", "deep")
    mkdirSync(nested, { recursive: true })
    const result = await resolveDirName(nested, runner)
    expect(result).toEqual({ dir: "normal-project", repo: root.replace(/\\/g, "/") })
  })

  it("uses the worktree directory name when .git points to a separate git dir", async () => {
    const parent = makeTempDir()
    const root = join(parent, "separate-git-project")
    const gitDir = join(parent, "git-metadata")
    mkdirSync(root, { recursive: true })
    git(root, "init", "--quiet", "--separate-git-dir", gitDir)
    git(root, "config", "user.name", "Recorder Test")
    git(root, "config", "user.email", "recorder@example.test")
    initialCommit(root)
    const result = await resolveDirName(root, runner)
    expect(result).toEqual({ dir: "separate-git-project", repo: root.replace(/\\/g, "/") })
  })

  it("uses the common repository root for linked worktrees", async () => {
    const parent = makeTempDir()
    const root = join(parent, "main-project")
    const worktree = join(parent, "linked-tree")
    initRepo(root)
    initialCommit(root)
    git(root, "worktree", "add", "--quiet", "-b", "recorder-test-worktree", worktree)
    mkdirSync(join(worktree, "nested"), { recursive: true })
    const result = await resolveDirName(join(worktree, "nested"), runner)
    expect(result).toEqual({ dir: "main-project", repo: root.replace(/\\/g, "/") })
  })

  it("uses the submodule working directory name and resolves its superproject", async () => {
    const parent = makeTempDir()
    const child = join(parent, "submodule-source")
    const root = join(parent, "super-project")
    initRepo(child)
    initialCommit(child)
    initRepo(root)
    execFileSync("git", ["-c", "protocol.file.allow=always", "submodule", "add", "--quiet", child, "vendor/widget"], {
      cwd: root, encoding: "utf8", stdio: "pipe",
    })
    git(root, "commit", "--quiet", "-m", "add submodule")
    const result = await resolveDirName(join(root, "vendor/widget"), runner)
    expect(result).toEqual({ dir: "widget", repo: join(root, "vendor/widget").replace(/\\/g, "/") })
  })

  it("uses the bare repository name and root for a bare clone", async () => {
    const parent = makeTempDir()
    const source = join(parent, "source")
    const bare = join(parent, "bare-project.git")
    initRepo(source)
    initialCommit(source)
    execFileSync("git", ["clone", "--bare", "--quiet", source, bare], { encoding: "utf8", stdio: "pipe" })
    const result = await resolveDirName(bare, runner)
    expect(result).toEqual({ dir: "bare-project", repo: bare.replace(/\\/g, "/") })
  })

  it("uses the bare repository name for a linked worktree of a bare clone", async () => {
    const parent = makeTempDir()
    const source = join(parent, "source")
    const bare = join(parent, "Server.git")
    const worktree = join(parent, "from-bare")
    initRepo(source)
    initialCommit(source)
    execFileSync("git", ["clone", "--bare", "--quiet", source, bare], { encoding: "utf8", stdio: "pipe" })
    git(bare, "worktree", "add", "--quiet", "--detach", worktree, "HEAD")

    const result = await resolveDirName(worktree, runner)
    expect(result.dir).toBe("Server")
  })

  it("falls back for non-repositories, missing paths, and caches resolved cwd values", async () => {
    const root = makeTempDir()
    const plain = join(root, "plain-project", "nested")
    mkdirSync(plain, { recursive: true })
    expect(await resolveDirName(plain, runner)).toEqual({ dir: "nested" })
    const resolver = createDirNameResolver(runner, async (path) => path === plain)
    expect(await resolver(plain)).toEqual({ dir: "nested" })
    expect(await resolver(join(root, "deleted-project"))).toEqual({ dir: "deleted-project" })

    const calls: string[][] = []
    const fake: GitRunner = { run: async (args) => {
      calls.push(args)
      if (args.includes("--git-common-dir")) return { ok: true, stdout: "/repo/.git\nfalse\n", stderr: "" }
      if (args.includes("--show-toplevel")) return { ok: true, stdout: "/repo\n", stderr: "" }
      return { ok: true, stdout: "", stderr: "" }
    } }
    const cache = new Map<string, { dir: string; repo?: string }>()
    const first = await resolveDirName("/repo/src", fake, { cache })
    const second = await resolveDirName("/repo/src", { run: async () => { throw new Error("cache miss") } }, { cache })
    expect(first).toEqual({ dir: "repo", repo: "/repo" })
    expect(second).toBe(first)
    expect(calls).toHaveLength(2)
  })
})
