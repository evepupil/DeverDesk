import { addDays, monthEnd, monthStart } from "../../../../src/domain/calendar"
import { hourlyRate, projectStats } from "../../../../src/domain/insights"
import { OPEN_STATUSES } from "../../../../src/domain/tasks"
import { toWallWorkbench } from "../../data/wall"
import { countTasksByProject, presentProject, values } from "./common"
import type { ReadTool } from "../../types"

interface ListProjectsInput {
  includeEnded?: boolean
}

export const listProjectsTool: ReadTool<ListProjectsInput> = {
  kind: "read",
  name: "list_projects",
  title: "List projects",
  description: "List side projects with this month's money, time, hourly rate, open task count, and next milestone. Use it to compare active projects or find a project to inspect.",
  inputSchema: {
    type: "object",
    properties: {
      includeEnded: { type: "boolean", default: false, description: "Include projects in the ended stage." },
    },
    additionalProperties: false,
  },
  async run(ctx, input) {
    const month = monthStart(ctx.clock.today)
    const end = monthEnd(ctx.clock.today)
    const [projectRecords, ledgerRecords, entryRecords, openCounts] = await Promise.all([
      ctx.data.projects(),
      ctx.data.ledger({ from: month, to: end }),
      ctx.data.entries({ from: ctx.clock.startOfDay(month), to: ctx.clock.startOfDay(addDays(end, 1)) }),
      countTasksByProject(ctx.data, { statuses: OPEN_STATUSES }),
    ])
    const projects = values(projectRecords).filter((project) => input.includeEnded === true || project.stage !== "ended")
    const wall = toWallWorkbench({
      projects: values(projectRecords),
      ledger: values(ledgerRecords),
      entries: values(entryRecords),
    }, ctx.clock)
    const stats = new Map(projectStats(wall, { start: month, end }).map((stat) => [stat.projectId, stat]))

    return {
      month,
      projects: projects.map((project) => {
        const stat = stats.get(project.id)
        const milestones = project.milestones.filter((milestone) => milestone.doneOn === null).sort((a, b) => a.due.localeCompare(b.due))
        const minutes = stat?.minutes ?? 0
        const net = stat?.net ?? 0
        return {
          ...presentProject(project),
          income: stat?.income ?? 0,
          expense: stat?.expense ?? 0,
          net,
          minutes,
          hourlyRate: hourlyRate(net, minutes),
          openTasks: openCounts.get(project.id) ?? 0,
          nextMilestone: milestones[0] ?? null,
        }
      }),
    }
  },
}
