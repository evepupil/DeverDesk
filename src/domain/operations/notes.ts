import type { DayKey, WeekNote } from "../types"

export function patchNote(note: WeekNote | null, week: DayKey, patch: Partial<Omit<WeekNote, "week">>): WeekNote {
  const current = note ?? { week, wins: "", improve: "", next: "" }
  return { ...current, ...patch }
}
