import type { Profile } from "@/domain/types"

interface TimeZoneAutoFillInput {
  syncedProfileTimeZone?: string
  browserTimeZone?: string
  firstSyncSucceeded: boolean
}

/** Fill only the timezone, and only after the first complete sync confirms the server profile. */
export function getTimeZoneAutoFillPatch({
  syncedProfileTimeZone,
  browserTimeZone,
  firstSyncSucceeded,
}: TimeZoneAutoFillInput): Pick<Profile, "timeZone"> | null {
  if (!firstSyncSucceeded || syncedProfileTimeZone || !browserTimeZone) return null
  return { timeZone: browserTimeZone }
}
