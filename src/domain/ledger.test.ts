import { beforeAll, describe, expect, it } from "vitest"
import { overduePending, parseAmount, pendingIncome, totals } from "./ledger"
import type {
  Channel,
  EntryKind,
  EntryStatus,
  IncomeCategory,
  ExpenseCategory,
  LedgerEntry,
} from "./types"

beforeAll(() => {
  process.env.TZ = "Asia/Shanghai"
})

let n = 0
function makeEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  n += 1
  const kind: EntryKind = overrides.kind ?? "income"
  const category: IncomeCategory | ExpenseCategory = overrides.category ?? (kind === "income" ? "sales" : "tools")
  return {
    id: `e${n}`,
    kind,
    amount: 100,
    projectId: null,
    category,
    channel: "alipay" as Channel,
    status: "received" as EntryStatus,
    date: "2026-09-15",
    expectedOn: null,
    note: "",
    createdAt: n,
    ...overrides,
  }
}

describe("totals", () => {
  it("只算已到账的收入和已支付的支出", () => {
    const entries = [
      makeEntry({ kind: "income", amount: 299, status: "received" }),
      makeEntry({ kind: "income", amount: 100, status: "pending" }), // 待到账不算
      makeEntry({ kind: "income", amount: 50, status: "refunded" }), // 已退款不算
      makeEntry({ kind: "expense", amount: 30, status: "received" }),
      makeEntry({ kind: "expense", amount: 20, status: "pending" }), // 待支付不算
    ]
    const result = totals(entries, "2026-09-01", "2026-09-30")
    expect(result).toEqual({ income: 299, expense: 30, net: 269 })
  })

  it("窗口外的日期不算", () => {
    const entries = [
      makeEntry({ kind: "income", amount: 100, date: "2026-08-31" }),
      makeEntry({ kind: "income", amount: 200, date: "2026-09-01" }),
    ]
    expect(totals(entries, "2026-09-01", "2026-09-30").income).toBe(200)
  })

  it("待到账过了窗口也不影响：状态优先于日期", () => {
    const entries = [makeEntry({ kind: "income", amount: 100, status: "pending", date: "2026-09-01" })]
    expect(totals(entries, "2026-09-01", "2026-09-30").income).toBe(0)
  })
})

describe("pendingIncome", () => {
  it("只含待到账的收入，按预计到账日排序", () => {
    const entries = [
      makeEntry({ kind: "income", status: "pending", expectedOn: "2026-10-10", id: "later" }),
      makeEntry({ kind: "income", status: "pending", expectedOn: "2026-10-02", id: "sooner" }),
      makeEntry({ kind: "income", status: "received", expectedOn: null, id: "received" }),
      makeEntry({ kind: "expense", status: "pending", expectedOn: "2026-10-01", id: "expense" }),
    ]
    const result = pendingIncome(entries)
    expect(result.map((entry) => entry.id)).toEqual(["sooner", "later"])
  })

  it("没有预计到账日的按记账日期排", () => {
    const entries = [
      makeEntry({ kind: "income", status: "pending", expectedOn: null, date: "2026-10-05", id: "a" }),
      makeEntry({ kind: "income", status: "pending", expectedOn: "2026-10-01", id: "b" }),
    ]
    expect(pendingIncome(entries).map((entry) => entry.id)).toEqual(["b", "a"])
  })
})

describe("overduePending", () => {
  it("只含过了预计到账日还没到的", () => {
    const entries = [
      makeEntry({ kind: "income", status: "pending", expectedOn: "2026-09-29", id: "overdue" }),
      makeEntry({ kind: "income", status: "pending", expectedOn: "2026-09-30", id: "today" }),
      makeEntry({ kind: "income", status: "pending", expectedOn: "2026-10-01", id: "future" }),
      makeEntry({ kind: "income", status: "received", expectedOn: "2026-09-01", id: "done" }),
    ]
    const result = overduePending(entries, "2026-09-30")
    expect(result.map((entry) => entry.id)).toEqual(["overdue"])
  })
})

describe("parseAmount", () => {
  it.each([
    ["299", 299],
    ["19.9", 19.9],
    ["1,280", 1280],
    ["¥30", 30],
  ])("合法：%s → %s", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected)
  })

  it.each(["0", "-1", "1.234", "abc"])("非法：%s → null", (raw) => {
    expect(parseAmount(raw)).toBeNull()
  })
})
