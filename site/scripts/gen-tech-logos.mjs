// 重新生成 src/content/tech-logos.ts：从 simple-icons（CC0）里抄出首页「基于这些开源项目」一栏的图标路径。
// 页面运行时不依赖 simple-icons；换图标、换顺序时改下面的清单再跑：node scripts/gen-tech-logos.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const icons = require("simple-icons")

/** [稳定的键, simple-icons 里的导出名, 官网, 显示名（不写就用图标自带的名字）] */
const LIST = [
  ["nextjs", "siNextdotjs", "https://nextjs.org"],
  ["react", "siReact", "https://react.dev"],
  ["typescript", "siTypescript", "https://www.typescriptlang.org"],
  ["tailwindcss", "siTailwindcss", "https://tailwindcss.com"],
  ["shadcn", "siShadcnui", "https://ui.shadcn.com"],
  ["radix", "siRadixui", "https://www.radix-ui.com"],
  ["lucide", "siLucide", "https://lucide.dev"],
  ["workers", "siCloudflareworkers", "https://workers.cloudflare.com"],
  ["sqlite", "siSqlite", "https://www.sqlite.org", "SQLite (D1)"],
  ["vitest", "siVitest", "https://vitest.dev"],
  ["eslint", "siEslint", "https://eslint.org"],
  ["pnpm", "siPnpm", "https://pnpm.io"],
]

const { version } = JSON.parse(readFileSync(new URL("../node_modules/simple-icons/package.json", import.meta.url), "utf8"))
let out = `/**
 * 首页「基于这些开源项目」一栏的图标：产品实际用到的开源项目。
 * 图形路径来自 simple-icons ${version}（CC0），由脚本一次性抄进来，页面运行时不依赖那个包。
 * 换图标时重新跑一遍抄写脚本，不要手改路径。
 */

export interface TechLogo {
  /** 稳定的键，交互检查用 */
  id: string
  /** 项目名，显示在图标旁边 */
  name: string
  /** 官网 */
  href: string
  /** 品牌色，悬停时给图标上色 */
  hex: string
  /** 24×24 画布里的 SVG 路径 */
  path: string
}

export const TECH_LOGOS: TechLogo[] = [
`
for (const [id, key, href, name] of LIST) {
  const icon = icons[key]
  if (!icon) throw new Error(`simple-icons 里没有 ${key}`)
  out += `  {\n    id: ${JSON.stringify(id)},\n    name: ${JSON.stringify(name ?? icon.title)},\n    href: ${JSON.stringify(href)},\n    hex: ${JSON.stringify(`#${icon.hex}`)},\n    path: ${JSON.stringify(icon.path)},\n  },\n`
}
out += "]\n"
writeFileSync(new URL("../src/content/tech-logos.ts", import.meta.url), out)
console.log(`写入 ${LIST.length} 个图标`)
