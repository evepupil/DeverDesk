export const COMMON_TIME_ZONES = [
  "Africa/Johannesburg",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Ho_Chi_Minh",
  "Australia/Brisbane",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Zurich",
  "Pacific/Auckland",
  "Pacific/Honolulu",
] as const

/** Return the current UTC offset using the runtime's IANA timezone data. */
export function formatTimeZoneOffset(timeZone: string, date: Date = new Date()): string | null {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value
    if (!name || name === "GMT") return "UTC+00:00"
    const match = /^GMT([+-]\d{2}:\d{2})$/.exec(name)
    return match ? `UTC${match[1]}` : "UTC+00:00"
  } catch (cause) {
    if (cause instanceof RangeError) return null
    throw cause
  }
}

/** Include a saved value and browser value even when they are not in the common list. */
export function buildTimeZoneOptions(current?: string, browser?: string): string[] {
  return [...new Set([...COMMON_TIME_ZONES, current, browser].filter((zone): zone is string => Boolean(zone)))].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  )
}
