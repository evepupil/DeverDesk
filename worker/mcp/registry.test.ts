import { describe, expect, it } from "vitest"
import { inputSchemaFor, registeredTools } from "./registry"

const KEYWORDS_ABOUT_FIELD_COMBINATIONS = ["oneOf", "allOf", "if", "then", "else", "not"]

/**
 * 找出把「几个字段怎么搭配」写进参数定义的写法：oneOf、allOf、if/then/else、not，
 * 以及要求某些字段必填的 anyOf。（只表示「这个值可以是 A 类型或 B 类型」的 anyOf 不算。）
 */
function fieldCombinationRules(node: unknown, path: string): string[] {
  if (Array.isArray(node)) return node.flatMap((item, index) => fieldCombinationRules(item, `${path}[${index}]`))
  if (node === null || typeof node !== "object") return []
  const record = node as Record<string, unknown>
  const found = KEYWORDS_ABOUT_FIELD_COMBINATIONS.filter((keyword) => keyword in record).map((keyword) => `${path}.${keyword}`)
  const anyOf = record.anyOf
  if (Array.isArray(anyOf) && anyOf.some((branch) => typeof branch === "object" && branch !== null && "required" in branch)) {
    found.push(`${path}.anyOf`)
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "properties" && value !== null && typeof value === "object") {
      // properties 下面的键是字段名，不是关键字
      for (const [name, schema] of Object.entries(value)) found.push(...fieldCombinationRules(schema, `${path}.properties.${name}`))
    } else {
      found.push(...fieldCombinationRules(value, `${path}.${key}`))
    }
  }
  return found
}

describe("工具的参数定义", () => {
  it("不把字段怎么搭配写进参数定义，搭配对不对交给工具执行时检查并用人话报错", () => {
    const offenders = registeredTools.flatMap((tool) => fieldCombinationRules(tool.inputSchema, tool.name))
    expect(offenders).toEqual([])
  })

  it("字段搭配错了的输入能通过参数定义这一关，由工具自己说清哪里不对", async () => {
    const mistakes: Array<[string, unknown]> = [
      ["log_time", { entries: [{ start: "2026-10-01T10:00", minutes: 30, end: "2026-10-01T10:30" }] }],
      ["log_time", { entries: [{ start: "2026-10-01T10:00" }] }],
      ["reschedule", { tasks: ["T-1"], selector: { overdue: true }, to: "2026-10-04" }],
      ["reschedule", { tasks: ["T-1"], to: "2026-10-04", shiftDays: 1 }],
      ["reschedule", { selector: {}, to: "2026-10-04" }],
      ["update_tasks", { updates: [{ task: "T-1" }] }],
      ["manage_routine", { action: "update" }],
      ["manage_project", { action: "update_milestone", project: "p-1" }],
    ]
    for (const [name, input] of mistakes) {
      const tool = registeredTools.find((item) => item.name === name)
      expect(tool, name).toBeDefined()
      const result = await inputSchemaFor(tool!)["~standard"].validate(input)
      expect(result.issues, `${name} ${JSON.stringify(input)}`).toBeUndefined()
    }
  })
})
