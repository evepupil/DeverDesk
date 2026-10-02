"use client"

import type { DayKey, Project } from "@/domain/types"
import { useT } from "@/i18n/react"
import { SheetSection } from "../common/sheet-parts"
import { MilestoneAddForm } from "./milestone-add-form"
import { MilestoneRow } from "./milestone-row"

/** 副业详情里的「里程碑」一段：清单（勾选、改、删）加底部的添加行 */
export function MilestoneSection({ project, done, today }: { project: Project; done: number; today: DayKey }) {
  const t = useT()
  return (
    <SheetSection
      title={t.projects.sheet.milestones}
      aside={
        project.milestones.length > 0 ? (
          <span className="text-xs text-fg-2 tabular">
            {done}/{project.milestones.length}
          </span>
        ) : undefined
      }
    >
      <ul className="-mx-1 flex flex-col">
        {project.milestones.map((milestone) => (
          <MilestoneRow key={milestone.id} projectId={project.id} milestone={milestone} today={today} />
        ))}
      </ul>
      <MilestoneAddForm projectId={project.id} today={today} />
    </SheetSection>
  )
}
