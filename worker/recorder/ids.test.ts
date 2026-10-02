import { describe, expect, it } from "vitest"
import { recorderEntryId, recorderTaskId } from "./ids"

async function sha256(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

describe("recorder ids", () => {
  it("uses the specified prefixes and the first 16 lowercase SHA-256 hex characters", async () => {
    const key = "stable upload key"
    const digest = (await sha256(key)).slice(0, 16)
    expect(await recorderTaskId(key)).toBe(`t-r${digest}`)
    expect(await recorderEntryId(key)).toBe(`E-r${digest}`)
    expect(await recorderTaskId(key)).toHaveLength(19)
    expect(await recorderEntryId(key)).toHaveLength(19)
  })
})
