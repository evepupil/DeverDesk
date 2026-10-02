import { beforeAll, describe, expect, it, vi } from "vitest"
import { createClock } from "./clock"

declare const process: { env: Record<string, string | undefined> }

beforeAll(() => {
  process.env.TZ = "UTC"
})

const instant = (value: string) => Date.parse(`${value}Z`)
const wall = (value: string) => Date.parse(`${value}Z`)

function referenceWall(formatter: Intl.DateTimeFormat, ms: number): number {
  const wholeSecond = Math.floor(ms / 1_000) * 1_000
  const parts = new Map(formatter.formatToParts(wholeSecond).map((part) => [part.type, Number(part.value)]))
  const local = new Date(0)
  local.setUTCFullYear(parts.get("year")!, parts.get("month")! - 1, parts.get("day")!)
  local.setUTCHours(parts.get("hour")!, parts.get("minute")!, parts.get("second")!, 0)
  return ms + local.getTime() - wholeSecond
}

describe("createClock", () => {
  it("formats UTC and Shanghai local dates and wall timestamps", () => {
    const utc = createClock("UTC", instant("2026-10-01T00:00:00"))
    expect(utc.timeZone).toBe("UTC")
    expect(utc.timeZoneKnown).toBe(true)
    expect(utc.today).toBe("2026-10-01")
    expect(utc.toWall(instant("2026-10-01T07:30:00"))).toBe(wall("2026-10-01T07:30:00"))

    const shanghai = createClock("Asia/Shanghai", instant("2026-09-30T16:00:00"))
    const logged = instant("2026-09-30T23:30:00")
    expect(shanghai.today).toBe("2026-10-01")
    expect(shanghai.dayOf(logged)).toBe("2026-10-01")
    expect(shanghai.formatLocal(logged)).toBe("2026-10-01 07:30")
    expect(shanghai.formatLocalTime(logged)).toBe("07:30")
    expect(shanghai.minuteOfDay(logged)).toBe(450)
    expect(shanghai.toWall(logged)).toBe(wall("2026-10-01T07:30:00"))
    expect(shanghai.fromWall(shanghai.toWall(logged))).toBe(logged)
  })

  it("returns empty local date strings for timestamps outside the Date range", () => {
    const clock = createClock("UTC", instant("2026-10-01T00:00:00"))
    for (const timestamp of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_VALUE, -Number.MAX_VALUE]) {
      expect(clock.formatLocal(timestamp)).toBe("")
      expect(clock.formatLocalTime(timestamp)).toBe("")
      expect(clock.dayOf(timestamp)).toBe("")
    }
  })

  it("falls back to UTC for empty and invalid time zones", () => {
    for (const timeZone of [undefined, "", "Not/A_Time_Zone"]) {
      const clock = createClock(timeZone, instant("2026-10-01T00:00:00"))
      expect(clock.timeZone).toBe("UTC")
      expect(clock.timeZoneKnown).toBe(false)
      expect(clock.today).toBe("2026-10-01")
    }
  })

  it("uses local midnight on either side of a date boundary", () => {
    const shanghai = createClock("Asia/Shanghai", instant("2026-10-01T00:00:00"))
    const justBefore = instant("2026-09-30T15:59:00")
    const midnight = instant("2026-09-30T16:00:00")
    expect(shanghai.dayOf(justBefore)).toBe("2026-09-30")
    expect(shanghai.dayOf(midnight)).toBe("2026-10-01")
    expect(shanghai.startOfDay("2026-10-01")).toBe(midnight)
    expect(shanghai.dayOf(shanghai.startOfDay("2026-10-01") - 60_000)).toBe("2026-09-30")

    const newYork = createClock("America/New_York", instant("2026-03-08T12:00:00"))
    expect(newYork.dayOf(instant("2026-03-09T03:59:00"))).toBe("2026-03-08")
    expect(newYork.dayOf(instant("2026-03-09T04:00:00"))).toBe("2026-03-09")
  })

  it("round-trips real instants outside repeated hours", () => {
    for (const [zone, value] of [
      ["UTC", "2026-10-01T07:30:00"],
      ["Asia/Shanghai", "2026-10-01T07:30:00"],
      ["America/New_York", "2026-03-08T06:30:00"],
      ["America/New_York", "2026-11-01T08:30:00"],
    ] as const) {
      const clock = createClock(zone, instant(value))
      const timestamp = instant(value)
      expect(clock.fromWall(clock.toWall(timestamp))).toBe(timestamp)
    }
  })

  it("resolves New York spring gaps forward and fall repeats to the first occurrence", () => {
    const spring = createClock("America/New_York", instant("2026-03-08T12:00:00"))
    expect(spring.parseLocal("2026-03-08T01:30")).toBe(instant("2026-03-08T06:30:00"))
    expect(spring.formatLocal(spring.parseLocal("2026-03-08T02:30")!)).toBe("2026-03-08 03:30")
    expect(spring.parseLocal("2026-03-08T02:30")).toBe(instant("2026-03-08T07:30:00"))

    const fall = createClock("America/New_York", instant("2026-11-01T12:00:00"))
    expect(fall.parseLocal("2026-11-01T01:30")).toBe(instant("2026-11-01T05:30:00"))
    expect(fall.parseLocal("2026-11-01T02:30")).toBe(instant("2026-11-01T07:30:00"))
  })

  it("chooses the first repeated wall time in Berlin and Sydney", () => {
    const berlin = createClock("Europe/Berlin", instant("2026-10-25T12:00:00"))
    expect(berlin.parseLocal("2026-10-25T02:30")).toBe(instant("2026-10-25T00:30:00"))

    const sydney = createClock("Australia/Sydney", instant("2026-04-05T12:00:00"))
    expect(sydney.parseLocal("2026-04-05T02:30")).toBe(instant("2026-04-04T15:30:00"))

    const azores = createClock("Atlantic/Azores", instant("2026-10-25T12:00:00"))
    expect(azores.startOfDay("2026-10-25")).toBe(instant("2026-10-25T00:00:00"))
  })

  it("parses only valid local date and minute forms", () => {
    const clock = createClock("Asia/Shanghai", instant("2026-10-01T01:00:00"))
    expect(clock.parseLocal("2026-10-01T07:30")).toBe(instant("2026-09-30T23:30:00"))
    expect(clock.parseLocal("07:30", "2026-10-02")).toBe(instant("2026-10-01T23:30:00"))
    expect(clock.parseLocal("07:30")).toBe(instant("2026-09-30T23:30:00"))

    for (const invalid of [
      "2026-02-30T10:00",
      "2025-02-29T10:00",
      "2026-10-01T25:00",
      "2026-10-01T10:60",
      "2026-10-1T10:00",
      "2026-10-01 10:00",
      "10:00:00",
      "1:00",
      "24:00",
      "10:60",
    ]) {
      expect(clock.parseLocal(invalid)).toBeNull()
    }
    expect(clock.parseLocal("10:00", "2026-02-30")).toBeNull()
  })

  it("matches direct time-zone conversion for every hour of 2026", () => {
    const zones = ["America/New_York", "Europe/Berlin", "Australia/Sydney"]
    for (const zone of zones) {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
      const clock = createClock(zone, Date.UTC(2026, 0, 1))
      const end = Date.UTC(2027, 0, 1)
      for (let ms = Date.UTC(2026, 0, 1); ms < end; ms += 3_600_000) {
        expect(clock.toWall(ms)).toBe(referenceWall(formatter, ms))
      }
    }
  })

  it("reuses cached offsets for timestamps on a stable UTC day", () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
    try {
      const now = Date.UTC(2041, 6, 10, 12)
      const clock = createClock("Pacific/Chatham", now)
      const callsAfterToday = spy.mock.calls.length
      clock.toWall(now)
      clock.toWall(now + 15 * 60_000)
      expect(spy).toHaveBeenCalledTimes(callsAfterToday + 2)
    } finally {
      spy.mockRestore()
    }
  })
})
