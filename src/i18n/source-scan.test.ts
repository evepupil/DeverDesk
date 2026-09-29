import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * 界面文字只能写在词条里：扫描 src 下的源码，找出词条文件以外写死的中文。
 * 不扫：中文词条本身、样例数据的中文文案、测试、注释。确实要保留的一行（比如指向中文文档的链接）在行尾写 i18n-ignore；
 * 整个文件都是输入规则而不是界面文字的（快速添加认的中文写法），在文件开头写 i18n-ignore-file 并说明原因。
 */

const SRC = fileURLToPath(new URL("../", import.meta.url))
const HAN = /[一-鿿]/

const SKIP = [
  `i18n${sep}messages${sep}zh-CN${sep}`,
  `data${sep}seed`,
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : []
  })
}

/** 去掉一行里的注释：块注释、JSX 注释、行尾 // 注释（引号外面的） */
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

export function hardcodedText(root: string): string[] {
  const found: string[] = []
  for (const file of sourceFiles(root)) {
    const name = relative(root, file)
    if (SKIP.some((prefix) => name.startsWith(prefix))) continue
    const content = readFileSync(file, "utf8")
    if (content.slice(0, 400).includes("i18n-ignore-file")) continue
    let inBlock = false
    content
      .split("\n")
      .forEach((line, index) => {
        const trimmed = line.trim()
        if (inBlock) {
          if (trimmed.includes("*/")) inBlock = false
          return
        }
        if (trimmed.startsWith("/*") && !trimmed.includes("*/")) {
          inBlock = true
          return
        }
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || line.includes("i18n-ignore")) return
        if (HAN.test(stripComments(line))) found.push(`${name.split(sep).join("/")}:${index + 1}  ${trimmed}`)
      })
  }
  return found
}

describe("界面文字都在词条里", () => {
  it("词条文件以外没有写死的中文", () => {
    const found = hardcodedText(SRC)
    expect(found, `这些行还有写死的中文：\n${found.join("\n")}`).toEqual([])
  })
})
