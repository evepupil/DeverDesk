import { execFileSync, spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildSync } from "esbuild"
import { afterEach, describe, expect, it } from "vitest"
import { createCommitFinder, detectNewCommits, detectNewCommitsLocked, parseGitLog, type RepoState } from "./commits"
import { createGitRunner } from "./runner"
import { readState, updateState } from "../store/state"
import type { GitRunner } from "../core/types"

const temporaryDirectories: string[] = []
const runner = createGitRunner()

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-git-commits-"))
  temporaryDirectories.push(directory)
  return directory
}

function git(cwd: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...env },
  }).trim()
}

function initRepo(path: string): void {
  git(path, ["init", "--quiet"])
  git(path, ["config", "user.name", "Recorder Test"])
  git(path, ["config", "user.email", "recorder@example.test"])
}

function commitFile(path: string, name: string, contents: string | Buffer, message: string, env: Record<string, string> = {}): void {
  writeFileSync(join(path, name), contents)
  git(path, ["add", name])
  git(path, ["commit", "--quiet", "-m", message, ...(message === "add-text" ? ["-m", "A commit body for parsing."] : [])], env)
}

function runChild(code: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", code, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
    let stderr = ""
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
    child.once("error", reject)
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Child exited with ${code}: ${stderr}`)))
  })
}

function bundleCommits(outputPath: string): void {
  const entry = join(process.cwd(), "integrations/recorder/src/git/commits.ts")
  const result = buildSync({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", write: false })
  const output = result.outputFiles[0]
  if (!output) throw new Error("Expected esbuild output")
  writeFileSync(outputPath, output.contents)
}

function record(sha: string, committedSeconds: number, authoredSeconds: number, email: string, subject: string, body: string, stats: string, recordSeparator = "\x1e", fieldSeparator = "\x1f"): string {
  return `${recordSeparator}${sha}${fieldSeparator}${committedSeconds}${fieldSeparator}${authoredSeconds}${fieldSeparator}${email}${fieldSeparator}${subject}${fieldSeparator}${subject}\n${body}\n${fieldSeparator}${stats}\n`
}

function separators(args: string[]): { record: string; field: string } {
  const format = args.find((arg) => arg.startsWith("--format=")) ?? ""
  return {
    record: format.match(/\x1e[a-f0-9]{16}R\x1e/)?.[0] ?? "\x1e",
    field: format.match(/\x1f[a-f0-9]{16}F\x1f/)?.[0] ?? "\x1f",
  }
}

describe("git commit discovery", () => {
  it("parses the real git --format/--numstat shape, including body, rename, and binary rows", async () => {
    const root = join(makeTempDir(), "repo")
    mkdirSync(root, { recursive: true })
    initRepo(root)
    commitFile(root, "text.txt", "one\ntwo\nthree\n", "add-text")
    commitFile(root, "binary.dat", Buffer.from([0, 1, 2, 0, 255]), "add-binary")
    const output = await runner.run([
      "-C", root, "log", "--no-merges", "--format=%x1e%H%x1f%ct%x1f%at%x1f%ae%x1f%s%x1f%B%x1f", "--numstat",
    ], root)
    expect(output.ok).toBe(true)
    const commits = parseGitLog(output.stdout)
    expect(commits).toHaveLength(2)
    expect(commits[0]).toMatchObject({ subject: "add-text", authorEmail: "recorder@example.test", additions: 3, deletions: 0, files: 1 })
    expect(commits[0]?.body).toBe("A commit body for parsing.")
    expect(commits[1]).toMatchObject({ subject: "add-binary", additions: 0, deletions: 0, files: 1 })
  })

  it("parses control characters in subjects and keeps empty-subject commits", async () => {
    const root = join(makeTempDir(), "repo")
    mkdirSync(root, { recursive: true })
    initRepo(root)
    commitFile(root, "initial.txt", "initial\n", "initial")
    const baseline = await detectNewCommits(runner, root, undefined)
    commitFile(root, "control.txt", "control\n", "subject with \x1f field and \x1e record markers")
    writeFileSync(join(root, "empty.txt"), "empty\n")
    git(root, ["add", "empty.txt"])
    git(root, ["commit", "--quiet", "--allow-empty-message", "-m", ""])

    const result = await detectNewCommits(runner, root, baseline.next, Date.now() - 5000)
    expect(result.commits).toHaveLength(2)
    expect(result.commits.map((commit) => commit.subject)).toContain("subject with \x1f field and \x1e record markers")
    expect(result.commits.map((commit) => commit.subject)).toContain("")
  })

  it("falls back to metadata when numstat is oversized and advances baseline after repeated git failures", async () => {
    const previous: RepoState = { head: "old-head", lastCommitAt: 100_000, seen: [] }
    const makeRecord = (args: string[]) => {
      const marker = separators(args)
      return `${marker.record}new-sha${marker.field}300${marker.field}200${marker.field}recorder@example.test${marker.field}large commit${marker.field}large commit\nbody\n${marker.field}`
    }
    const calls: string[][] = []
    const fallbackGit: GitRunner = { run: async (args) => {
      calls.push(args)
      if (args.includes("HEAD") && args.includes("rev-parse")) return { ok: true, stdout: "new-head\n", stderr: "" }
      if (args.includes("--format=%ct")) return { ok: true, stdout: "300\n", stderr: "" }
      if (args.includes("user.email")) return { ok: true, stdout: "recorder@example.test\n", stderr: "" }
      if (args.includes("--numstat")) return { ok: false, stdout: "", stderr: "maxBuffer exceeded" }
      if (args.includes("old-head..HEAD")) return { ok: true, stdout: makeRecord(args), stderr: "" }
      return { ok: false, stdout: "", stderr: "unexpected" }
    } }
    const fallback = await detectNewCommits(fallbackGit, "/repo", previous)
    expect(fallback.commits).toMatchObject([{ sha: "new-sha", additions: 0, deletions: 0, files: 0 }])
    expect(fallback.next?.head).toBe("new-head")
    expect(calls.filter((args) => args.some((arg) => arg.startsWith("--format=")) && !args.includes("--format=%ct"))).toHaveLength(2)

    const failingGit: GitRunner = { run: async (args) => {
      if (args.includes("HEAD") && args.includes("rev-parse")) return { ok: true, stdout: "new-head\n", stderr: "" }
      if (args.includes("--format=%ct")) return { ok: true, stdout: "300\n", stderr: "" }
      if (args.includes("user.email")) return { ok: true, stdout: "recorder@example.test\n", stderr: "" }
      return { ok: false, stdout: "", stderr: "git unavailable" }
    } }
    const failed = await detectNewCommits(failingGit, "/repo", previous)
    expect(failed.commits).toEqual([])
    expect(failed.next?.head).toBe("new-head")
    await detectNewCommits(failingGit, "/repo", failed.next)
  })

  it("baselines existing history, detects owned commits chronologically, and ignores foreign authors", async () => {
    const root = join(makeTempDir(), "repo")
    mkdirSync(root, { recursive: true })
    initRepo(root)
    commitFile(root, "initial.txt", "initial\n", "initial")
    const baseline = await detectNewCommits(runner, root, undefined)
    expect(baseline.commits).toEqual([])
    expect(baseline.next?.head).toBe(git(root, ["rev-parse", "HEAD"]))

    commitFile(root, "text.txt", "one\ntwo\n", "add-text")
    commitFile(root, "binary.dat", Buffer.from([0, 8, 9]), "add-binary")
    const discovered = await detectNewCommits(runner, root, baseline.next, Date.now() - 60_000)
    expect(discovered.commits.map((commit) => commit.subject)).toEqual(["add-text", "add-binary"])
    expect(discovered.next?.head).toBe(git(root, ["rev-parse", "HEAD"]))

    commitFile(root, "foreign.txt", "foreign\n", "foreign-author", { GIT_AUTHOR_EMAIL: "elsewhere@example.test", GIT_COMMITTER_EMAIL: "elsewhere@example.test" })
    const afterForeign = await detectNewCommits(runner, root, discovered.next, Date.now() - 60_000)
    expect(afterForeign.commits).toEqual([])
    expect(afterForeign.next?.head).toBe(git(root, ["rev-parse", "HEAD"]))
  })

  it("uses bounded since fallback when old history was rewritten and filters amend duplicates", async () => {
    const previous: RepoState = { head: "old-head", lastCommitAt: 100_000, seen: [] }
    const calls: string[][] = []
    const fake: GitRunner = { run: async (args) => {
      calls.push(args)
      if (args.includes("HEAD") && args.includes("rev-parse")) return { ok: true, stdout: "new-head\n", stderr: "" }
      if (args.includes("--format=%ct")) return { ok: true, stdout: "300\n", stderr: "" }
      if (args.includes("user.email")) return { ok: true, stdout: "recorder@example.test\n", stderr: "" }
      if (args.includes("old-head..HEAD")) return { ok: false, stdout: "", stderr: "unknown revision" }
      if (args.some((arg) => arg.startsWith("--since="))) {
        const marker = separators(args)
        return { ok: true, stdout: record("new-sha", 300, 200, "recorder@example.test", "subject", "body", "2\t1\tfile.txt", marker.record, marker.field), stderr: "" }
      }
      return { ok: false, stdout: "", stderr: "unexpected" }
    } }
    const result = await detectNewCommits(fake, "/repo", previous)
    expect(result.commits.map((commit) => commit.sha)).toEqual(["new-sha"])
    expect(result.next?.head).toBe("new-head")
    expect(calls.some((args) => args.includes("--since=@100") && args.includes("-n") && args.includes("50"))).toBe(true)

    const repo = join(makeTempDir(), "amend")
    mkdirSync(repo, { recursive: true })
    initRepo(repo)
    commitFile(repo, "same.txt", "first\n", "repeatable")
    const first = await detectNewCommits(runner, repo, undefined, Date.now() - 60_000)
    expect(first.commits).toHaveLength(1)
    writeFileSync(join(repo, "same.txt"), "second version\n")
    git(repo, ["add", "same.txt"])
    git(repo, ["commit", "--quiet", "--amend", "--no-edit"])
    const amended = await detectNewCommits(runner, repo, first.next, Date.now() - 60_000)
    expect(amended.commits).toEqual([])
    expect(amended.next?.head).not.toBe(first.next?.head)
  })

  it("limits new-repository discovery to 50 commits and supports time-range backfill", async () => {
    const calls: string[][] = []
    const fake: GitRunner = { run: async (args) => {
      calls.push(args)
      if (args.includes("HEAD") && args.includes("rev-parse")) return { ok: true, stdout: "head\n", stderr: "" }
      if (args.includes("--format=%ct")) return { ok: true, stdout: "500\n", stderr: "" }
      if (args.includes("user.email")) return { ok: true, stdout: "recorder@example.test\n", stderr: "" }
      if (args.includes("--since=@10") && args.includes("-n")) {
        const marker = separators(args)
        return { ok: true, stdout: record("sha", 450, 440, "recorder@example.test", "new", "", "1\t0\tfile", marker.record, marker.field), stderr: "" }
      }
      if (args.includes("--until=@20")) {
        const marker = separators(args)
        return { ok: true, stdout: record("range", 15, 14, "recorder@example.test", "range", "", "1\t0\tfile", marker.record, marker.field), stderr: "" }
      }
      return { ok: false, stdout: "", stderr: "unexpected" }
    } }
    const start = await detectNewCommits(fake, "/repo", undefined, 10_999)
    expect(start.commits.map((commit) => commit.sha)).toEqual(["sha"])
    expect(calls.some((args) => args.includes("-n") && args.includes("50"))).toBe(true)
    const finder = createCommitFinder(fake)
    expect((await finder("/repo", 10_000, 20_000)).map((commit) => commit.sha)).toEqual(["range"])
  })

  it("serializes concurrent same-repository discovery so three commits are returned once", async () => {
    const root = join(makeTempDir(), "repo")
    mkdirSync(root, { recursive: true })
    initRepo(root)
    commitFile(root, "initial.txt", "initial\n", "initial")
    const baseline = await detectNewCommits(runner, root, undefined)
    if (!baseline.next) throw new Error("Expected a git baseline")
    const home = join(makeTempDir(), "home")
    await updateState(home, (state) => { state.repos[root.replace(/\\/g, "/")] = baseline.next! })
    commitFile(root, "one.txt", "one\n", "one")
    commitFile(root, "two.txt", "two\n", "two")
    commitFile(root, "three.txt", "three\n", "three")

    const results = await Promise.all(Array.from({ length: 12 }, () => detectNewCommitsLocked(home, runner, root.replace(/\\/g, "/"))))
    const returned = results.flatMap((commits) => commits)
    expect(returned.map((commit) => commit.subject)).toEqual(["one", "two", "three"])
    expect(readState(home).repos[root.replace(/\\/g, "/")]?.head).toBe(git(root, ["rev-parse", "HEAD"]))
  })

  it("serializes commit discovery across processes so only one hook receives each commit", async () => {
    const root = join(makeTempDir(), "repo")
    mkdirSync(root, { recursive: true })
    initRepo(root)
    commitFile(root, "initial.txt", "initial\n", "initial")
    const baseline = await detectNewCommits(runner, root, undefined)
    if (!baseline.next) throw new Error("Expected a git baseline")
    const home = join(makeTempDir(), "home")
    await updateState(home, (state) => { state.repos[root.replace(/\\/g, "/")] = baseline.next! })
    commitFile(root, "new.txt", "new\n", "shared-new-commit")

    const bundlePath = join(home, "commits.cjs")
    bundleCommits(bundlePath)
    const code = `const {execFileSync}=require("node:child_process"),{writeFileSync}=require("node:fs"),{detectNewCommitsLocked}=require(${JSON.stringify(bundlePath)});const git={run:async(args,cwd)=>{try{return{ok:true,stdout:execFileSync("git",args,{cwd,encoding:"utf8"}),stderr:""}}catch(e){return{ok:false,stdout:e.stdout?.toString()||"",stderr:e.stderr?.toString()||""}}}};(async()=>{const found=await detectNewCommitsLocked(process.argv[1],git,process.argv[2]);writeFileSync(process.argv[3],JSON.stringify(found.map(c=>c.sha)))})().catch(e=>{console.error(e);process.exitCode=1})`
    const outputs = [join(home, "one.json"), join(home, "two.json")]
    await Promise.all(outputs.map((output) => runChild(code, [home, root.replace(/\\/g, "/"), output])))
    const returned = outputs.flatMap((path) => JSON.parse(readFileSync(path, "utf8")) as string[])
    expect(returned).toHaveLength(1)
    expect(returned[0]).toBe(git(root, ["rev-parse", "HEAD"]))
    expect(readState(home).repos[root.replace(/\\/g, "/")]?.head).toBe(returned[0])
  }, 15000)
})
