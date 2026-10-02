import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const recorderDir = dirname(fileURLToPath(import.meta.url))
const repoDir = resolve(recorderDir, "../..")
const entryPoint = join(recorderDir, "src/cli.ts")
const defaultOutput = join(repoDir, "integrations/claude-code/bin/deverdesk-recorder")
const packageInfo = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf8"))

/**
 * @param {{ out?: string }} [options]
 * @returns {Promise<string>}
 */
export async function buildRecorder(options = {}) {
  const outputPath = resolve(options.out ?? defaultOutput)
  const result = await build({
    entryPoints: [entryPoint],
    outfile: outputPath,
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    minify: false,
    sourcemap: false,
    legalComments: "none",
    banner: { js: "#!/usr/bin/env node" },
    define: { __RECORDER_VERSION__: JSON.stringify(packageInfo.version) },
    write: false,
  })

  const outputFile = result.outputFiles[0]
  if (!outputFile) throw new Error("esbuild 没有生成记录器输出")

  const contents = outputFile.text.replace(/\r\n?/g, "\n").replace(/\n*$/, "\n")
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, contents, "utf8")
  if (process.platform !== "win32") chmodSync(outputPath, 0o755)
  return outputPath
}

function parseArguments(args) {
  let check = false
  let out

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--check") {
      check = true
    } else if (arg === "--out") {
      const value = args[index + 1]
      if (!value || value.startsWith("--")) throw new Error("--out 后需要指定路径")
      out = value
      index += 1
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }

  if (check && out) throw new Error("--check 不能和 --out 同时使用")
  return { check, out }
}

async function main() {
  const { check, out } = parseArguments(process.argv.slice(2))
  if (!check) {
    await buildRecorder({ out })
    return
  }

  const temporaryDir = mkdtempSync(join(tmpdir(), "deverdesk-recorder-"))
  const temporaryOutput = join(temporaryDir, "deverdesk-recorder")
  try {
    await buildRecorder({ out: temporaryOutput })
    const builtOutput = readFileSync(temporaryOutput)
    const committedOutput = existsSync(defaultOutput) ? readFileSync(defaultOutput) : undefined
    if (!committedOutput || !builtOutput.equals(committedOutput)) {
      console.error("记录器构建产物已过期，请运行 pnpm build:recorder")
      process.exitCode = 1
    }
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
