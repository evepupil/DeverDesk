import type { DayKey } from "../types"

export interface OpContext {
  now: number
  today: DayKey
  newId(prefix: string): string
}
