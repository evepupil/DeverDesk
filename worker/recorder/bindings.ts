import type { BindingsResponse } from "../../src/sync/recorder-protocol"
import { dirNameKey } from "../../src/domain/dir-names"
import type { Project } from "../../src/domain/types"
import type { DataSource, Versioned } from "../mcp/types"

export interface RecorderBinding {
  dir: string
  projectId: string
  projectName: string
}

export function bindingsFromProjects(projects: readonly Versioned<Project>[]): BindingsResponse {
  const bindings: RecorderBinding[] = []
  for (const { value: project } of projects) {
    for (const name of project.dirNames ?? []) {
      bindings.push({ dir: dirNameKey(name), projectId: project.id, projectName: project.name })
    }
  }
  bindings.sort((a, b) => a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : a.projectId.localeCompare(b.projectId))
  return { bindings }
}

export async function getRecorderBindings(data: DataSource): Promise<BindingsResponse> {
  return bindingsFromProjects(await data.projects())
}
