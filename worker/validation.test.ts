import { describe, expect, it } from "vitest"
import { PUSH_BATCH_SIZE } from "../src/sync/protocol"
import { validateLoginRequest, validatePushRequest } from "./validation"

const NOW = 1_760_000_000_000

function change(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: "task", id: "T-101", data: { title: "写周报" }, updatedAt: NOW, ...overrides }
}

describe("validatePushRequest", () => {
  it("正常的一批改动通过，返回归一化的 changes", () => {
    const result = validatePushRequest({
      changes: [
        change(),
        change({ kind: "timer", id: "singleton", data: null }),
        change({ kind: "note", id: "2026-09-28", data: { week: "2026-09-28", wins: "w" }, updatedAt: 0 }),
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.changes).toHaveLength(3)
      expect(result.value.changes[0]).toEqual({ kind: "task", id: "T-101", data: { title: "写周报" }, updatedAt: NOW })
    }
  })

  it("超过每批上限被拒（上限恰好等于 PUSH_BATCH_SIZE 时通过）", () => {
    const exactly = validatePushRequest({ changes: Array.from({ length: PUSH_BATCH_SIZE }, (_, i) => change({ id: `T-${i}` })) })
    expect(exactly.ok).toBe(true)
    const over = validatePushRequest({ changes: Array.from({ length: PUSH_BATCH_SIZE + 1 }, (_, i) => change({ id: `T-${i}` })) })
    expect(over.ok).toBe(false)
  })

  it("未知种类被拒", () => {
    expect(validatePushRequest({ changes: [change({ kind: "bookmark" })] }).ok).toBe(false)
    expect(validatePushRequest({ changes: [change({ kind: 7 })] }).ok).toBe(false)
  })

  it("编号为空被拒", () => {
    expect(validatePushRequest({ changes: [change({ id: "" })] }).ok).toBe(false)
  })

  it("编号太长被拒（101 个字符拒绝，100 个字符通过）", () => {
    expect(validatePushRequest({ changes: [change({ id: "a".repeat(101) })] }).ok).toBe(false)
    expect(validatePushRequest({ changes: [change({ id: "a".repeat(100) })] }).ok).toBe(true)
  })

  it("编号含非法字符被拒（空格、斜杠、中文），允许字母数字和 . _ : -", () => {
    expect(validatePushRequest({ changes: [change({ id: "T 101" })] }).ok).toBe(false)
    expect(validatePushRequest({ changes: [change({ id: "T/101" })] }).ok).toBe(false)
    expect(validatePushRequest({ changes: [change({ id: "任务-1" })] }).ok).toBe(false)
    expect(validatePushRequest({ changes: [change({ id: "T_101:2.3-4" })] }).ok).toBe(true)
  })

  it("updatedAt 必须是非负整数：小数、负数、NaN、Infinity、字符串都被拒", () => {
    for (const updatedAt of [1.5, NOW + 0.5, -1, -NOW, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "1760000000000", null]) {
      const result = validatePushRequest({ changes: [change({ updatedAt })] })
      expect(result.ok, `updatedAt=${String(updatedAt)} 应被拒`).toBe(false)
    }
    expect(validatePushRequest({ changes: [change({ updatedAt: 0 })] }).ok).toBe(true)
  })

  it("data 缺失、undefined 或不能序列化为 JSON 时被拒", () => {
    const withoutData: Record<string, unknown> = { ...change() }
    delete withoutData.data
    expect(validatePushRequest({ changes: [withoutData] }).ok).toBe(false)
    expect(validatePushRequest({ changes: [change({ data: undefined })] }).ok).toBe(false)
    expect(validatePushRequest({ changes: [change({ data: 9007199254740993n })] }).ok).toBe(false)
    expect(validatePushRequest({ changes: [change({ data: null })] }).ok).toBe(true)
  })

  it("单条内容超过 200KB 被拒，不超过时通过", () => {
    const ok = validatePushRequest({ changes: [change({ data: { blob: "x".repeat(200 * 1024 - 20) } })] })
    expect(ok.ok).toBe(true)
    const tooBig = validatePushRequest({ changes: [change({ data: { blob: "x".repeat(220 * 1024) } })] })
    expect(tooBig.ok).toBe(false)
  })

  it("请求体不是对象或 changes 不是数组时被拒", () => {
    expect(validatePushRequest(null).ok).toBe(false)
    expect(validatePushRequest("changes").ok).toBe(false)
    expect(validatePushRequest({ changes: "nope" }).ok).toBe(false)
    expect(validatePushRequest({}).ok).toBe(false)
  })

  it("改动条目不是对象时被拒", () => {
    expect(validatePushRequest({ changes: ["task"] }).ok).toBe(false)
    expect(validatePushRequest({ changes: [null] }).ok).toBe(false)
  })
})

describe("validateLoginRequest", () => {
  it("带 password 字段的对象通过", () => {
    const result = validateLoginRequest({ password: "口令A" })
    expect(result).toEqual({ ok: true, value: { password: "口令A" } })
  })

  it("缺 password 或不是对象时被拒", () => {
    expect(validateLoginRequest({}).ok).toBe(false)
    expect(validateLoginRequest({ password: 123 }).ok).toBe(false)
    expect(validateLoginRequest(null).ok).toBe(false)
    expect(validateLoginRequest("password").ok).toBe(false)
  })
})
