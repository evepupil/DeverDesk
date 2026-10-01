import { presentProject, presentTask, presentLedger, presentationContext, values } from "./common"
import { LIMIT } from "../shared/schema"
import { ToolInputError, type ReadTool } from "../../types"

interface SearchInput {
  query: string
  limit?: number
}

export const searchTool: ReadTool<SearchInput> = {
  kind: "read",
  name: "search",
  title: "Search records",
  description: "Search task titles, project names, and ledger notes for a keyword. Use it to find records when their exact identifiers or dates are unknown.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, maxLength: 80, description: "Keyword to search for, 1-80 characters." },
      limit: LIMIT(8, 20),
    },
    required: ["query"],
    additionalProperties: false,
  },
  async run(ctx, input) {
    if (input.query.trim().length === 0 || input.query.length > 80) {
      throw new ToolInputError("\"query\" must contain 1 to 80 characters.")
    }
    const limit = input.limit ?? 8
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new ToolInputError("\"limit\" must be an integer from 1 to 20.")
    }
    const [tasks, ledger, projects] = await Promise.all([
      ctx.data.tasks({ text: input.query, limit: limit + 1 }),
      ctx.data.ledger({ text: input.query, limit: limit + 1 }),
      ctx.data.projects(),
    ])
    const matchingProjects = values(projects).filter((project) => project.name.toLowerCase().includes(input.query.toLowerCase()))
    const taskValues = values(tasks)
    const ledgerValues = values(ledger)
    const projectValues = matchingProjects
    const truncatedByKind = {
      tasks: taskValues.length > limit,
      projects: projectValues.length > limit,
      ledger: ledgerValues.length > limit,
    }
    const present = presentationContext(ctx, projects)

    return {
      tasks: taskValues.slice(0, limit).map((task) => presentTask(task, present)),
      projects: projectValues.slice(0, limit).map(presentProject),
      ledger: ledgerValues.slice(0, limit).map((entry) => presentLedger(entry, present)),
      truncated: Object.values(truncatedByKind).some(Boolean),
      truncatedByKind,
    }
  },
}
