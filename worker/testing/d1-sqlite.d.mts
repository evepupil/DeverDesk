// d1-sqlite.mjs 的类型：测试里当 D1Database 用，另外多一个直接查表的 rows()。
export interface TestD1Database extends D1Database {
  rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[]
}

export function createTestD1(): TestD1Database
