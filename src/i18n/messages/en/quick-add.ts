import type { Messages } from "../types"

export const quickAdd: Messages["quickAdd"] = {
  minutes: (n) => `${n} min`,
  hours: (n) => `${n} hr`,
  priority: { 2: "Medium", 3: "High", 4: "Urgent" },
}
