// 单元测试用的 D1：用 Node 自带的 SQLite（node:sqlite）实现 D1 的接口，并跑一遍 worker/migrations 里的建表语句。
// 只在测试里用，Worker 本身不引用它。行为对齐 D1：绑定 undefined 报错、布尔转 0/1、batch 放进一个事务。
import { readdirSync, readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

const MIGRATIONS = fileURLToPath(new URL("../migrations/", import.meta.url))

function normalize(value) {
  if (value === undefined) throw new TypeError("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'")
  if (typeof value === "boolean") return value ? 1 : 0
  return value
}

function assertPatternLimit(sql, params) {
  for (const match of sql.matchAll(/\b(?:LIKE|GLOB)\s+(\?)/gi)) {
    const index = (sql.slice(0, match.index).match(/\?/g) ?? []).length
    const pattern = params[index]
    if (typeof pattern === "string" && new TextEncoder().encode(pattern).length > 50) {
      throw new Error("LIKE or GLOB pattern too complex")
    }
  }
}

/** 只读语句（SELECT、WITH … SELECT）不改 changes()，其余语句执行后读 changes() */
function isQuery(sql) {
  return /^\s*(select|with\b[\s\S]*\bselect\b(?![\s\S]*\b(insert|update|delete)\b))/i.test(sql)
}

function plainRows(rows) {
  return rows.map((row) => ({ ...row }))
}

class Statement {
  constructor(db, sql, params = []) {
    this.db = db
    this.sql = sql
    this.params = params
  }

  bind(...values) {
    return new Statement(this.db, this.sql, values.map(normalize))
  }

  execute() {
    assertPatternLimit(this.sql, this.params)
    const statement = this.db.prepare(this.sql)
    const results = plainRows(statement.all(...this.params))
    const changes = isQuery(this.sql) ? 0 : Number(this.db.prepare("SELECT changes() AS c").get().c)
    return { results, success: true, meta: { changes, duration: 0, last_row_id: 0, rows_read: results.length, rows_written: changes } }
  }

  async all() {
    return this.execute()
  }

  async run() {
    return this.execute()
  }

  async first(column) {
    const { results } = this.execute()
    if (results.length === 0) return null
    return column === undefined ? results[0] : (results[0][column] ?? null)
  }

  async raw() {
    return this.execute().results.map((row) => Object.values(row))
  }
}

class TestD1 {
  constructor(db) {
    this.db = db
  }

  prepare(sql) {
    return new Statement(this.db, sql)
  }

  async batch(statements) {
    this.db.exec("BEGIN")
    try {
      const results = statements.map((statement) => statement.execute())
      this.db.exec("COMMIT")
      return results
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }

  async exec(sql) {
    this.db.exec(sql)
    return { count: 1, duration: 0 }
  }

  /** 测试里直接看表内容用 */
  rows(sql, ...params) {
    return plainRows(this.db.prepare(sql).all(...params.map(normalize)))
  }
}

/** 新建一个内存数据库，按顺序执行全部迁移 */
export function createTestD1() {
  const db = new DatabaseSync(":memory:")
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(readFileSync(MIGRATIONS + file, "utf8"))
  }
  return new TestD1(db)
}
