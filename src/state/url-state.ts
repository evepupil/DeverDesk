"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useMemo } from "react"

import { readFilters, type Filters } from "@/domain/filters"

/** 读写地址栏参数：筛选、视图页签、周都放在这里，刷新和分享都能还原 */
export function useUrlState() {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key)
        else next.set(key, value)
      }
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [params, pathname, router]
  )

  return { params, pathname, update }
}

export function useFilters<K extends string>(keys: readonly K[]) {
  const { params, update } = useUrlState()
  const filters = useMemo(() => readFilters(params, keys), [params, keys])

  const setValues = useCallback(
    (key: K, values: string[]) => update({ [key]: values.length ? values.join(",") : null }),
    [update]
  )

  const toggle = useCallback(
    (key: K, value: string) => {
      const current = filters[key] ?? []
      setValues(key, current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
    },
    [filters, setValues]
  )

  const clearAll = useCallback(
    () => update(Object.fromEntries(keys.map((key) => [key, null]))),
    [keys, update]
  )

  return { filters: filters as Filters<K>, setValues, toggle, clearAll }
}
