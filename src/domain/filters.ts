/** 筛选条件存在地址栏里：?status=todo,doing&project=p-blog */

export type Filters<K extends string = string> = Partial<Record<K, string[]>>

export function readFilters<K extends string>(
  params: { get(name: string): string | null },
  keys: readonly K[]
): Filters<K> {
  const filters: Filters<K> = {}
  for (const key of keys) {
    const raw = params.get(key)
    if (raw) {
      const values = raw.split(",").filter(Boolean)
      if (values.length) filters[key] = values
    }
  }
  return filters
}

export function countActive(filters: Filters): number {
  return Object.values(filters).filter((values) => values && values.length > 0).length
}

/** 某个字段下每个选项命中的数量（在其余条件都生效的前提下） */
export function optionCounts<T>(
  items: T[],
  valuesOf: (item: T) => string[],
  matchesOthers: (item: T) => boolean
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (!matchesOthers(item)) continue
    for (const value of valuesOf(item)) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}
