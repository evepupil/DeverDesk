import { describe, expect, it } from "vitest"

import { getTimeZoneAutoFillPatch } from "./time-zone-autofill"

describe("getTimeZoneAutoFillPatch", () => {
  it("keeps a timezone already present in the synced server profile", () => {
    expect(
      getTimeZoneAutoFillPatch({
        syncedProfileTimeZone: "Asia/Shanghai",
        browserTimeZone: "America/Los_Angeles",
        firstSyncSucceeded: true,
      })
    ).toBeNull()
  })

  it("patches only the timezone when the synced server profile has none", () => {
    const syncedProfile = {
      name: "Server name",
      weekdayMin: 210,
      weekendMin: 330,
      dayStartHour: 7,
      dayEndHour: 23,
      timeZone: undefined as string | undefined,
    }
    expect(
      getTimeZoneAutoFillPatch({
        syncedProfileTimeZone: syncedProfile.timeZone,
        browserTimeZone: "Asia/Taipei",
        firstSyncSucceeded: true,
      })
    ).toEqual({ timeZone: "Asia/Taipei" })
    expect(syncedProfile).toEqual({
      name: "Server name",
      weekdayMin: 210,
      weekendMin: 330,
      dayStartHour: 7,
      dayEndHour: 23,
      timeZone: undefined,
    })
  })

  it("does not mistake an old local cache for the synced server profile", () => {
    const oldLocalProfile = { name: "Old local name", weekdayMin: 180 }
    const serverProfile = { timeZone: "Europe/Paris" }
    expect("timeZone" in oldLocalProfile).toBe(false)
    expect(
      getTimeZoneAutoFillPatch({
        syncedProfileTimeZone: serverProfile.timeZone,
        browserTimeZone: "America/New_York",
        firstSyncSucceeded: true,
      })
    ).toBeNull()
  })

  it("waits through an offline first sync and fills after a later successful sync", () => {
    expect(
      getTimeZoneAutoFillPatch({ syncedProfileTimeZone: undefined, browserTimeZone: "Asia/Tokyo", firstSyncSucceeded: false })
    ).toBeNull()
    expect(
      getTimeZoneAutoFillPatch({ syncedProfileTimeZone: undefined, browserTimeZone: "Asia/Tokyo", firstSyncSucceeded: true })
    ).toEqual({ timeZone: "Asia/Tokyo" })
  })
})
