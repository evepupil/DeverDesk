/**
 * 按版本打包 DeverDesk（本地版 / 在线版）。
 *
 * 用法：
 *   node scripts/build.mjs                    # 用环境变量 NEXT_PUBLIC_DEVERDESK_EDITION，没配就是 cloud
 *   node scripts/build.mjs --edition local    # 本地版
 *   node scripts/build.mjs --edition cloud    # 在线版
 *
 * 参数 --edition 只接受 local 和 cloud，其他值直接报错退出（退出码 1）。
 * 设置好环境变量后依次跑 `next build` 和 `node scripts/flatten-segments.mjs`：
 * 第二步修的是 Windows 下静态导出的分段预取文件名，必须紧跟第一步。
 * 任何一步失败都原样透传退出码。Windows 下用 shell: true 启动，输出直接打到当前终端。
 */
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { delimiter, join } from "node:path"

const ROOT = fileURLToPath(new URL("../", import.meta.url))

const EDITIONS = ["local", "cloud"]

function readEditionArg(argv) {
  let edition
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--edition") {
      edition = argv[++i]
      if (edition === undefined) {
        console.error("build: --edition 后面要跟 local 或 cloud")
        process.exit(1)
      }
    } else if (arg.startsWith("--edition=")) {
      edition = arg.slice("--edition=".length)
    } else {
      console.error(`build: 无法识别的参数 ${arg}（用法：node scripts/build.mjs [--edition local|cloud]）`)
      process.exit(1)
    }
  }
  if (edition === undefined) {
    // 没给参数就沿用环境变量，仍然没有就是在线版
    const fromEnv = process.env.NEXT_PUBLIC_DEVERDESK_EDITION
    return EDITIONS.includes(fromEnv) ? fromEnv : "cloud"
  }
  if (!EDITIONS.includes(edition)) {
    console.error(`build: --edition 只支持 ${EDITIONS.join(" 或 ")}，收到的是 "${edition}"`)
    process.exit(1)
  }
  return edition
}

const edition = readEditionArg(process.argv.slice(2))
console.log(`build: 正在打包${edition === "local" ? "本地版" : "在线版"}（NEXT_PUBLIC_DEVERDESK_EDITION=${edition}）`)

// 直接 node 运行本脚本时 PATH 里没有 node_modules/.bin，补进去让 `next` 能被找到
const env = {
  ...process.env,
  NEXT_PUBLIC_DEVERDESK_EDITION: edition,
  PATH: [join(ROOT, "node_modules", ".bin"), process.env.PATH ?? ""].join(delimiter),
}

const steps = ["next build", "node scripts/flatten-segments.mjs"]

for (const step of steps) {
  console.log(`build: 运行 ${step}`)
  const result = spawnSync(step, { cwd: ROOT, env, shell: true, stdio: "inherit" })
  if (result.error) {
    console.error(`build: ${step} 启动失败：${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`build: ${step} 失败，退出码 ${result.status ?? "null"}`)
    process.exit(result.status ?? 1)
  }
}

console.log(`build: ${edition === "local" ? "本地版" : "在线版"}打包完成`)
