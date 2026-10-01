import { describe, expect, it } from "vitest"

import { buildTimeZoneOptions, formatTimeZoneOffset } from "./time-zones"

describe("formatTimeZoneOffset", () => {
  it("formats fixed and seasonal offsets", () => {
    expect(formatTimeZoneOffset("Asia/Shanghai", new Date("2026-01-15T12:00:00Z"))).toBe("UTC+08:00")
    expect(formatTimeZoneOffset("America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe("UTC-05:00")
    expect(formatTimeZoneOffset("America/New_York", new Date("2026-07-15T12:00:00Z"))).toBe("UTC-04:00")
    expect(formatTimeZoneOffset("UTC", new Date("2026-01-15T12:00:00Z"))).toBe("UTC+00:00")
    expect(formatTimeZoneOffset("Mars/Olympus_Mons")).toBeNull()
  })
})

describe("buildTimeZoneOptions", () => {
  it("deduplicates and sorts common, current, and browser zones", () => {
    const options = buildTimeZoneOptions("Asia/Shanghai", "America/Anchorage")
    expect(options.filter((zone) => zone === "Asia/Shanghai")).toHaveLength(1)
    expect(options).toContain("America/Anchorage")
    expect(options).toEqual([...options].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  })
})
