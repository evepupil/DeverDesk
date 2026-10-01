import { describe, expect, it } from "vitest"
import { DIR_NAMES_MAX, DIR_NAME_MAX_LENGTH, dirNameKey, findProjectByDir, validateDirNames } from "./dir-names"

const projects = [
  { id: "p1", name: "模板站", dirNames: ["template-shop", "Shop-Admin"] },
  { id: "p2", name: "博客", dirNames: undefined },
  { id: "p3", name: "中转站", dirNames: ["relay"] },
]

describe("validateDirNames", () => {
  it("去首尾空白，保留原大小写和顺序", () => {
    expect(validateDirNames(["  Blog-V2 ", "blog-web"], projects, "p2")).toEqual({ ok: true, value: ["Blog-V2", "blog-web"] })
  })

  it("空列表合法（解绑）", () => {
    expect(validateDirNames([], projects, "p1")).toEqual({ ok: true, value: [] })
  })

  it("空名字、全是空白都拒绝", () => {
    expect(validateDirNames([""], projects, null)).toEqual({ ok: false, error: { kind: "empty" } })
    expect(validateDirNames(["   "], projects, null)).toEqual({ ok: false, error: { kind: "empty" } })
  })

  it("超长、含斜杠或反斜杠、数量超限都拒绝", () => {
    expect(validateDirNames(["a".repeat(DIR_NAME_MAX_LENGTH + 1)], projects, null)).toMatchObject({ ok: false, error: { kind: "too-long" } })
    expect(validateDirNames(["a".repeat(DIR_NAME_MAX_LENGTH)], projects, null).ok).toBe(true)
    expect(validateDirNames(["a/b"], projects, null)).toMatchObject({ ok: false, error: { kind: "bad-char", name: "a/b" } })
    expect(validateDirNames(["a\\b"], projects, null)).toMatchObject({ ok: false, error: { kind: "bad-char" } })
    const many = Array.from({ length: DIR_NAMES_MAX + 1 }, (_, index) => `d${index}`)
    expect(validateDirNames(many, projects, null)).toEqual({ ok: false, error: { kind: "too-many" } })
    expect(validateDirNames(many.slice(0, DIR_NAMES_MAX), projects, null).ok).toBe(true)
  })

  it("同一组里不分大小写重复拒绝", () => {
    expect(validateDirNames(["Blog", "blog"], projects, null)).toEqual({ ok: false, error: { kind: "repeated", name: "blog" } })
  })

  it("别的副业占着的目录名拒绝，并说出是谁占着（不分大小写）", () => {
    expect(validateDirNames(["RELAY"], projects, "p2")).toEqual({
      ok: false,
      error: { kind: "taken", name: "RELAY", projectId: "p3", projectName: "中转站" },
    })
  })

  it("自己占着的目录名不算冲突", () => {
    expect(validateDirNames(["template-shop", "new-one"], projects, "p1")).toEqual({ ok: true, value: ["template-shop", "new-one"] })
  })

  it("新建副业时（selfId 为 null）所有已占用的都冲突", () => {
    expect(validateDirNames(["template-shop"], projects, null)).toMatchObject({ ok: false, error: { kind: "taken", projectId: "p1" } })
  })
})

describe("findProjectByDir / dirNameKey", () => {
  it("不分大小写找副业，找不到返回 undefined", () => {
    expect(findProjectByDir(projects, "SHOP-admin")?.id).toBe("p1")
    expect(findProjectByDir(projects, "relay ")?.id).toBe("p3")
    expect(findProjectByDir(projects, "unknown")).toBeUndefined()
    expect(findProjectByDir(projects, "   ")).toBeUndefined()
  })

  it("dirNameKey 去空白并转小写", () => {
    expect(dirNameKey("  DeverDesk ")).toBe("deverdesk")
  })
})
