import { describe, expect, it } from "vitest"
import { LOCALES } from "../i18n/locales"
import { CHANGELOG } from "./changelog"
import { SHOT_NAMES } from "./screenshots"

function versionParts(version: string): number[] {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`版本号应形如 v0.4.1：${version}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

describe("更新日志数据", () => {
  it("版本号唯一、从新到旧严格递减", () => {
    const versions = CHANGELOG.map((entry) => versionParts(entry.version))
    for (let i = 1; i < versions.length; i++) {
      expect(compare(versions[i - 1] ?? [], versions[i] ?? [])).toBeGreaterThan(0)
    }
  })

  it("日期是 YYYY-MM-DD，且不比后一条早", () => {
    for (let i = 0; i < CHANGELOG.length; i++) {
      const entry = CHANGELOG[i]!
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const next = CHANGELOG[i + 1]
      if (next) expect(entry.date >= next.date).toBe(true)
    }
  })

  it("每条至少 3 项改动、至少 1 个完整提交编号，文字中英文都不为空", () => {
    for (const entry of CHANGELOG) {
      expect(entry.changes.length).toBeGreaterThanOrEqual(3)
      expect(entry.commits.length).toBeGreaterThanOrEqual(1)
      for (const sha of entry.commits) expect(sha).toMatch(/^[0-9a-f]{40}$/)
      for (const locale of LOCALES) {
        expect(entry.title[locale].trim()).not.toBe("")
        expect(entry.summary[locale].trim()).not.toBe("")
        for (const change of entry.changes) expect(change.text[locale].trim()).not.toBe("")
      }
    }
  })

  it("配图只用已有的截图名", () => {
    for (const entry of CHANGELOG) {
      if (entry.shot) expect(SHOT_NAMES).toContain(entry.shot)
    }
  })

  it("共 5 个版本，最新是 v0.4.1", () => {
    expect(CHANGELOG).toHaveLength(5)
    expect(CHANGELOG[0]?.version).toBe("v0.4.1")
  })
})
