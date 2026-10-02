import { existsSync, readFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const recorderDir = fileURLToPath(new URL(".", import.meta.url))
const entryPoint = resolve(recorderDir, "src/cli.ts")
const committedBundle = resolve(recorderDir, "../claude-code/bin/deverdesk-recorder")
const hasEntryPoint = existsSync(entryPoint)
const hasCommittedBundle = existsSync(committedBundle)
const buildModuleUrl = new URL("./build.mjs", import.meta.url).href
let temporaryDir = ""

async function buildRecorder(out: string) {
  const builderModule = await import(buildModuleUrl) as {
    buildRecorder(options: { out: string }): Promise<string>
  }
  return builderModule.buildRecorder({ out })
}

beforeAll(async () => {
  temporaryDir = await mkdtemp(join(tmpdir(), "deverdesk-recorder-test-"))
})

afterAll(async () => {
  if (temporaryDir) await rm(temporaryDir, { recursive: true, force: true })
})

describe("recorder build", () => {
  it.skipIf(!hasEntryPoint)("builds a standalone Node 18 executable", async () => {
    const output = join(temporaryDir, basename(committedBundle))
    await buildRecorder(output)
    const contents = readFileSync(output, "utf8")

    expect(contents.startsWith("#!/usr/bin/env node")).toBe(true)
    expect(contents).not.toContain("\r")
    expect(contents).not.toContain('require("esbuild")')
    execFileSync(process.execPath, ["--check", output], { stdio: "pipe" })
  })

  it.skipIf(!hasEntryPoint || !hasCommittedBundle)("matches the committed plugin executable byte for byte", async () => {
    const output = join(temporaryDir, "rebuilt-deverdesk-recorder")
    await buildRecorder(output)
    expect(readFileSync(output)).toEqual(readFileSync(committedBundle))
  })
})
