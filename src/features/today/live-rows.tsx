"use client"

import { ProjectMark } from "@/components/base/marks"
import { useT } from "@/i18n/react"
import { useProjectsById } from "@/state/hooks"
import type { LiveWindowRow } from "./live-windows"

export function LiveRows({ rows }: { rows: LiveWindowRow[] }) {
  const t = useT()
  const projectsById = useProjectsById()

  return rows.map((row) => {
    const project = projectsById.get(row.projectId)
    return (
      <li
        key={`${row.session}:${row.since}`}
        className="flex h-8 min-w-0 items-center gap-2 border-b border-line bg-progress/[0.07] px-3 text-sm"
      >
        <span className="w-[4.75rem] shrink-0 text-xs text-warn tabular">
          {t.common.taskSheet.startedAt(row.startedAt)}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
          <ProjectMark name={row.projectName} color={project?.color ?? "gray"} size={14} />
          <span className="min-w-0 truncate">{row.projectName}</span>
        </span>
        <span className="shrink-0 text-xs text-warn tabular">{row.formattedMinutes}</span>
      </li>
    )
  })
}
