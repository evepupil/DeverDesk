import type { Messages } from "../types"

export const format: Messages["format"] = {
  minutes: (n) => `${n} min`,
  hours: (n) => `${n} hr`,
  hoursMinutes: (hours, minutes) => `${hours} hr ${minutes} min`,
  flat: "Flat",
  points: (value) => `${value} pts`,
  currencyUnit: () => null,
}
