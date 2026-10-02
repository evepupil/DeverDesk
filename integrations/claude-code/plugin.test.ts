import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

type Hook = {
  command?: string
  args?: string[]
  async?: boolean
  timeout?: number
  if?: string
  statusMessage?: string
}

type HookGroup = {
  matcher?: string
  hooks: Hook[]
}

const pluginDir = fileURLToPath(new URL(".", import.meta.url))
const repoDir = resolve(pluginDir, "../..")
const pluginJsonPath = resolve(pluginDir, ".claude-plugin/plugin.json")
const mcpJsonPath = resolve(pluginDir, ".mcp.json")
const hooksJsonPath = resolve(pluginDir, "hooks/hooks.json")
const skillPath = resolve(pluginDir, "skills/deverdesk/SKILL.md")
const marketplacePath = resolve(repoDir, ".claude-plugin/marketplace.json")

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
}

describe("Claude Code plugin structure", () => {
  it("has the required manifest metadata and credentials", () => {
    const plugin = readJson(pluginJsonPath)
    for (const field of ["name", "displayName", "version", "description", "author", "homepage", "repository", "license", "keywords", "userConfig"]) {
      expect(plugin[field]).toBeDefined()
    }
    expect(plugin.name).toBe("deverdesk")
    const userConfig = plugin.userConfig as Record<string, { type?: string; required?: boolean; sensitive?: boolean }>
    expect(userConfig.server_url).toMatchObject({ type: "string", required: true })
    expect(userConfig.token).toMatchObject({ type: "string", required: true, sensitive: true })
  })

  it("uses user-config placeholders for the MCP connection", () => {
    const mcp = readJson(mcpJsonPath)
    const servers = mcp.mcpServers as Record<string, unknown>
    expect(servers.deverdesk).toEqual({
      type: "http",
      url: "${user_config.server_url}/mcp",
      headers: { Authorization: "Bearer ${user_config.token}" },
    })
  })

  it("declares only the specified silent recorder hooks", () => {
    const hooks = readJson(hooksJsonPath).hooks as Record<string, HookGroup[]>
    const expectedEvents = ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd", "PostToolUse"]
    expect(Object.keys(hooks).sort()).toEqual(expectedEvents.sort())

    for (const [event, groups] of Object.entries(hooks)) {
      for (const hook of groups.flatMap((group) => group.hooks)) {
        expect(hook.command).toBe("node")
        expect(hook.args?.[0]).toBe("${CLAUDE_PLUGIN_ROOT}/bin/deverdesk-recorder")
        expect(hook.args?.slice(1)).toEqual(["hook", "claude-code", event])
        expect(hook.statusMessage).toBeUndefined()
      }
    }

    for (const event of ["UserPromptSubmit", "Stop", "PostToolUse"]) {
      expect(hooks[event].flatMap((group) => group.hooks).every((hook) => hook.async === true)).toBe(true)
    }
    for (const event of ["SessionStart", "SessionEnd"]) {
      expect(hooks[event].flatMap((group) => group.hooks).every((hook) => hook.async !== true)).toBe(true)
    }
    expect(hooks.SessionStart[0].hooks[0].timeout).toBe(5)
    expect(hooks.SessionEnd[0].hooks[0].timeout).toBe(3)
    expect(hooks.PostToolUse).toHaveLength(1)
    expect(hooks.PostToolUse[0].matcher).toBe("Bash")
    expect(hooks.PostToolUse[0].hooks.map((hook) => hook.if)).toEqual([
      "Bash(git commit *)",
      "Bash(git -C * commit *)",
    ])
  })

  it("has the required skill frontmatter", () => {
    const skill = readFileSync(skillPath, "utf8")
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1]
    expect(frontmatter).toBeDefined()
    expect(frontmatter).toMatch(/^name: deverdesk$/m)
    expect(frontmatter).toMatch(/^description: .+$/m)
    expect(frontmatter).toMatch(/^allowed-tools: Bash\(deverdesk-recorder \*\)$/m)
  })

  it("points the marketplace entry at a valid plugin", () => {
    const marketplace = readJson(marketplacePath)
    expect(marketplace.name).toBe("deverdesk")
    expect((marketplace.owner as Record<string, unknown>).name).toBe("DeverDesk")
    const plugins = marketplace.plugins as Array<{ name?: string; source?: string }>
    const entry = plugins.find((plugin) => plugin.name === "deverdesk")
    expect(entry).toBeDefined()
    if (!entry?.source) throw new Error("Marketplace entry has no plugin source")
    expect(existsSync(resolve(repoDir, entry.source, ".claude-plugin/plugin.json"))).toBe(true)
  })

  it("keeps every plugin and marketplace JSON file free of CR characters", () => {
    for (const path of [pluginJsonPath, mcpJsonPath, hooksJsonPath, marketplacePath]) {
      expect(readFileSync(path, "utf8"), path).not.toContain("\r")
    }
  })
})
