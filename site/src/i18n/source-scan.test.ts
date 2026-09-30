import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 界面文字只能写在词条里：扫描组件、区块和路由文件，找出写死的中文。
 * 不扫：词条（src/i18n/messages）、数据（src/content）、测试。注释里的中文不算。
 * 确实要保留的一行（比如语言切换里写死的「中文」）在行尾写 i18n-ignore。
 */

const ROOT = process.cwd()
const DIRS = ["src/app", "src/components", "src/sections", "src/lib"].map((dir) => join(ROOT, dir))
const HAN = /[一-鿿]/

function files(dir: string): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return files(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : []
  })
}

/** 去掉注释：块注释、JSX 注释、引号外面的行尾注释 */
function stripComments(line: string): string {
  let text = line.replace(/\{\/\*.*?\*\/\}/g, "").replace(/\/\*.*?\*\//g, "")
  let quote: string | null = null
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      if (char === "\\") index++
      else if (char === quote) quote = null
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char
    } else if (char === "/" && text[index + 1] === "/") {
      text = text.slice(0, index)
      break
    }
  }
  return text
}

describe("写死的中文", () => {
  it("组件、区块、路由里没有词条以外的中文", () => {
    const hits: string[] = []
    for (const file of DIRS.flatMap(files)) {
      let inBlock = false
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((raw, index) => {
          let line = raw
          if (inBlock) {
            const end = line.indexOf("*/")
            if (end < 0) return
            line = line.slice(end + 2)
            inBlock = false
          }
          const start = line.indexOf("/*")
          if (start >= 0 && line.indexOf("*/", start) < 0) {
            line = line.slice(0, start)
            inBlock = true
          }
          if (/^\s*\*/.test(line) || line.includes("i18n-ignore")) return
          if (HAN.test(stripComments(line))) hits.push(`${relative(ROOT, file)}:${index + 1}  ${raw.trim()}`)
        })
    }
    expect(hits).toEqual([])
  })
})
