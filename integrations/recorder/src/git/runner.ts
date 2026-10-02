import { spawn } from "node:child_process"
import type { GitRunner } from "../core/types"

const MAX_BUFFER = 8 * 1024 * 1024

export function createGitRunner(): GitRunner {
  return {
    run(args, cwd, options = {}) {
      return new Promise((resolve) => {
        const stdout: Buffer[] = []
        const stderr: Buffer[] = []
        let stdoutBytes = 0
        let stderrBytes = 0
        let settled = false
        let child: ReturnType<typeof spawn> | undefined

        const output = (chunks: Buffer[]): string => Buffer.concat(chunks).toString("utf8")
        const finish = (ok: boolean, message?: string): void => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          const errorOutput = output(stderr)
          resolve({
            ok,
            stdout: output(stdout),
            stderr: [errorOutput, message].filter(Boolean).join("\n"),
          })
        }
        const stop = (message: string): void => {
          try { child?.kill() } catch { /* process may already have exited */ }
          finish(false, message)
        }
        const timer = setTimeout(() => stop(`git timed out after ${options.timeoutMs ?? 5000} ms`), options.timeoutMs ?? 5000)
        const collect = (chunks: Buffer[], current: number, chunk: Buffer, assign: (count: number) => void): boolean => {
          const remaining = MAX_BUFFER - current
          if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
          const next = current + Math.min(chunk.length, Math.max(remaining, 0))
          assign(next)
          return chunk.length > remaining
        }

        try {
          child = spawn("git", args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
        } catch (error) {
          finish(false, error instanceof Error ? error.message : String(error))
          return
        }

        const spawned = child
        if (!spawned?.stdout || !spawned.stderr) {
          finish(false, "git spawn did not create output streams")
          return
        }
        spawned.stdout.on("data", (value: Buffer | string) => {
          if (settled) return
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
          if (collect(stdout, stdoutBytes, chunk, (count) => { stdoutBytes = count })) stop(`git stdout exceeded ${MAX_BUFFER} bytes`)
        })
        spawned.stderr.on("data", (value: Buffer | string) => {
          if (settled) return
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
          if (collect(stderr, stderrBytes, chunk, (count) => { stderrBytes = count })) stop(`git stderr exceeded ${MAX_BUFFER} bytes`)
        })
        spawned.stdout.on("error", (error) => stop(`git stdout failed: ${error.message}`))
        spawned.stderr.on("error", (error) => stop(`git stderr failed: ${error.message}`))
        spawned.on("error", (error) => finish(false, `git spawn failed: ${error.message}`))
        spawned.on("close", (code) => finish(code === 0))
      })
    },
  }
}
