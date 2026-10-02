import { createSession, createToken, isSuccessToolCall, McpClient, requestJson } from "./mcp-client.mjs"

const toolData = (call) => call?.structuredContent && typeof call.structuredContent === "object" ? call.structuredContent : {}
const atShanghai = (day, time) => new Date(`${day}T${time}:00+08:00`).getTime()

export async function seedM6({ base, password, day, runId }) {
  const session = await createSession(base, password)
  if (session.exchange.status !== 200 || !session.cookie) throw new Error(`session creation failed (${session.exchange.status})`)
  const created = await createToken(base, session.cookie, { name: `M6 recorder ${runId}`, tier: "write" })
  if (created.exchange.status !== 201 || !created.token) throw new Error(`seed token creation failed (${created.exchange.status})`)

  const mcp = new McpClient(base, created.token)
  const dayCall = await mcp.callTool("get_day", {})
  const dayData = toolData(dayCall)
  const mcpDay = dayData.date
  const quill = await mcp.callTool("manage_project", {
    action: "create", name: "Quill", color: "teal", stage: "building",
    goal: "M6 recorder and timeline acceptance project", directories: ["quill-app", "quill-docs"],
    reason: "M6 screenshot acceptance seed",
  })
  const beacon = await mcp.callTool("manage_project", {
    action: "create", name: "Beacon", color: "amber", stage: "idea",
    goal: "M6 recorder upload acceptance project", directories: ["beacon"], reason: "M6 screenshot acceptance seed",
  })
  if (!isSuccessToolCall(dayCall) || !isSuccessToolCall(quill) || !isSuccessToolCall(beacon)) {
    throw new Error(`MCP project seed failed: ${quill.text || beacon.text || dayCall.text}`)
  }

  const tasks = await mcp.callTool("add_tasks", {
    tasks: [
      { title: "M6 Quill scheduled task", project: "Quill", status: "todo", estimateMin: 45, plannedFor: day, startAt: "13:00" },
      { title: "M6 Beacon unscheduled task", project: "Beacon", status: "todo", estimateMin: 30, plannedFor: day },
    ],
    reason: "M6 screenshot acceptance timeline tasks",
  })
  if (!isSuccessToolCall(tasks)) throw new Error(`MCP task seed failed: ${tasks.text}`)

  const upload = await requestJson(base, "/api/recorder/upload", {
    method: "POST", token: created.token,
    body: {
      client: { name: "M6 screenshot acceptance", version: "1.0.0", agent: "codex" },
      tasks: [
        {
          key: `m6:${runId}:webhook`, dir: "quill-app", title: "Fix webhook retry", source: "commit",
          finishedAt: atShanghai(day, "10:05"),
          commits: [{ sha: "c31b87a4d0e9f62b1a7c55e6d8f0a2b3c4d5e6f7", subject: "Retry failed webhook deliveries" }],
          entries: [{ key: `m6:${runId}:entry:webhook`, start: atShanghai(day, "09:10"), end: atShanghai(day, "10:05"), minutes: 55 }],
        },
        {
          key: `m6:${runId}:pricing`, dir: "quill-docs", title: "Add pricing page", source: "commit",
          finishedAt: atShanghai(day, "10:30"),
          commits: [{ sha: "d42c98b5e1fa037c2b8d66f7e9a1b3c4d5e6f708", subject: "Add pricing page" }],
          entries: [{ key: `m6:${runId}:entry:pricing`, start: atShanghai(day, "09:40"), end: atShanghai(day, "10:30"), minutes: 50 }],
        },
        {
          key: `m6:${runId}:onboarding`, dir: "beacon", title: "Tidy onboarding copy", source: "commit",
          finishedAt: atShanghai(day, "11:40"),
          commits: [{ sha: "e53da9c6f20b148d3c9e77a8f0b2c4d5e6f70819", subject: "Tidy onboarding copy" }],
          entries: [{ key: `m6:${runId}:entry:onboarding`, start: atShanghai(day, "11:00"), end: atShanghai(day, "11:40"), minutes: 40 }],
        },
      ],
    },
  })
  if (upload.status !== 200 || upload.data?.created?.tasks !== 3 || upload.data?.created?.entries !== 3) {
    throw new Error(`recorder upload seed failed (HTTP ${upload.status}): ${upload.text}`)
  }

  const liveRequest = () => ({ windows: [
    { session: `m6:${runId}:live-one`, dir: "quill-app", agent: "codex", since: Date.now() - 20 * 60_000, minutes: 20 },
    { session: `m6:${runId}:live-two`, dir: "quill-docs", agent: "claude-code", since: Date.now() - 8 * 60_000, minutes: 8 },
  ] })
  const live = await requestJson(base, "/api/recorder/live", { method: "PUT", token: created.token, body: liveRequest() })
  if (live.status !== 204) throw new Error(`recorder live seed failed (HTTP ${live.status}): ${live.text}`)

  const longName = "L".repeat(60)
  const longAttempt = await mcp.callTool("manage_project", {
    action: "create", name: longName, color: "gray", stage: "idea", reason: "M6 60-character project-name boundary check",
  })
  return { token: created.token, day, mcpDay, mcpTimeZone: dayData.timeZone, timeZoneKnown: dayData.timeZoneKnown, longName, longAttempt, liveRequest }
}
