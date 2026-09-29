// Next 16 在 Windows 上静态导出时，会把分段预取文件写成子目录（__next.customers/__PAGE__.txt），
// 而浏览器请求的是点号拼接的文件名（__next.customers.__PAGE__.txt）。这里补一份点号文件名的副本，
// 让静态托管直接可用、控制台不再出现 404。
import { copyFile, readdir, stat } from "node:fs/promises"
import { join, relative, sep } from "node:path"

const OUT = new URL("../out/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else files.push(full)
  }
  return files
}

let copied = 0
for (const file of await walk(OUT)) {
  const parts = relative(OUT, file).split(sep)
  const index = parts.findIndex((part) => part.startsWith("__next.") && !part.endsWith(".txt"))
  if (index === -1) continue
  const flat = join(OUT, ...parts.slice(0, index), parts.slice(index).join("."))
  try {
    await stat(flat)
  } catch {
    await copyFile(file, flat)
    copied++
  }
}
console.log(`flatten-segments: ${copied} file(s)`)
