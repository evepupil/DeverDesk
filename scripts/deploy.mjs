/**
 * 部署在线版：先把数据库迁移应用到线上（建表 / 补表），再部署 Worker。
 * 先打包：pnpm build；再运行：pnpm run deploy（pnpm 自带一个 deploy 命令，要写 run）。
 *
 * 新账号第一次手动部署时线上还没有数据库，迁移会报找不到。这时先部署一次
 * （wrangler 按配置自动建好数据库并绑定），再迁移。一键部署按钮会提前建好数据库，走正常顺序。
 */
import { spawnSync } from "node:child_process"

const MIGRATE = "wrangler d1 migrations apply DB --remote"
const DEPLOY = "wrangler deploy"
const MISSING_DATABASE = "Couldn't find a D1 DB"

/** 跑一条命令并把输出原样打印出来；返回是否成功和输出内容 */
function run(command) {
  console.log(`deploy: 运行 ${command}`)
  const result = spawnSync(command, { shell: true, encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) {
    console.error(`deploy: 启动失败：${result.error.message}`)
    process.exit(1)
  }
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`, status: result.status ?? 1 }
}

const migrate = run(MIGRATE)
if (migrate.ok) {
  const deploy = run(DEPLOY)
  process.exit(deploy.status)
}

if (!migrate.output.includes(MISSING_DATABASE)) process.exit(migrate.status)

console.log("deploy: 线上还没有数据库，先部署一次让 wrangler 建好，再建表")
const first = run(DEPLOY)
if (!first.ok) process.exit(first.status)
const retry = run(MIGRATE)
process.exit(retry.status)
