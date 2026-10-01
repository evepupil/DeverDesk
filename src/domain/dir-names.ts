import type { Project } from "./types"

/**
 * 副业的「目录名」：本机记录器用它认出「在哪个文件夹写代码」属于哪个副业。
 * 规则：最多 8 个，每个 1–60 字、去掉首尾空白、不含 / 和 \，整份数据里不分大小写不重复。
 * 页面（副业表单）、服务器（记录器接口）、MCP（manage_project）都用这里的校验，保证口径一致。
 */

export const DIR_NAMES_MAX = 8
export const DIR_NAME_MAX_LENGTH = 60

/** 比较用的键：不分大小写 */
export function dirNameKey(name: string): string {
  return name.trim().toLowerCase()
}

export type DirNamesError =
  | { kind: "empty" }
  | { kind: "too-long"; name: string }
  | { kind: "bad-char"; name: string }
  | { kind: "too-many" }
  | { kind: "repeated"; name: string }
  | { kind: "taken"; name: string; projectId: string; projectName: string }

export type DirNamesResult = { ok: true; value: string[] } | { ok: false; error: DirNamesError }

type ProjectDirs = Pick<Project, "id" | "name" | "dirNames">

/**
 * 校验并规范一组目录名（去首尾空白，保留原大小写和顺序）。
 * selfId 是正在编辑的副业（它自己占着的目录名不算冲突）；新建时给 null。
 */
export function validateDirNames(
  names: readonly string[],
  projects: readonly ProjectDirs[],
  selfId: string | null,
): DirNamesResult {
  const cleaned = names.map((name) => name.trim())
  if (cleaned.length > DIR_NAMES_MAX) return { ok: false, error: { kind: "too-many" } }

  const seen = new Set<string>()
  for (const name of cleaned) {
    if (name.length === 0) return { ok: false, error: { kind: "empty" } }
    if (name.length > DIR_NAME_MAX_LENGTH) return { ok: false, error: { kind: "too-long", name } }
    if (/[\\/]/.test(name)) return { ok: false, error: { kind: "bad-char", name } }
    const key = dirNameKey(name)
    if (seen.has(key)) return { ok: false, error: { kind: "repeated", name } }
    seen.add(key)
  }

  for (const project of projects) {
    if (project.id === selfId) continue
    for (const taken of project.dirNames ?? []) {
      if (seen.has(dirNameKey(taken))) {
        const name = cleaned.find((candidate) => dirNameKey(candidate) === dirNameKey(taken)) ?? taken
        return { ok: false, error: { kind: "taken", name, projectId: project.id, projectName: project.name } }
      }
    }
  }
  return { ok: true, value: cleaned }
}

/** 按目录名找副业（不分大小写）；没绑定返回 undefined */
export function findProjectByDir<T extends ProjectDirs>(projects: readonly T[], dir: string): T | undefined {
  const key = dirNameKey(dir)
  if (key.length === 0) return undefined
  return projects.find((project) => (project.dirNames ?? []).some((name) => dirNameKey(name) === key))
}
