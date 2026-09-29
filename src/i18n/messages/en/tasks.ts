import type { Messages } from "../types"

export const tasks: Messages["tasks"] = {
  newTask: "New task",
  count: (n) => `${n} ${n === 1 ? "task" : "tasks"}`,
  clearFilters: "Clear filters",
  scopes: {
    all: "All",
    week: "This week",
    unplanned: "Unscheduled",
  },
  layout: {
    label: "Layout",
    board: "Board",
    list: "List",
  },
  display: {
    group: "Group by",
    sort: "Sort by",
    sortPriority: "Priority",
    sortDue: "Due date",
    sortCreated: "Created",
    sortTitle: "Title",
    showEnded: "Show ended groups",
    onCard: "Show on cards",
    propertyId: "ID",
    propertyEstimate: "Estimate",
    propertyDue: "Due",
  },
  board: {
    newInGroup: (group) => `New task in ${group}`,
    collapseColumn: "Collapse column",
    emptyGroup: "No tasks",
    more: (n) => `Show more (${n} left)`,
    expandGroup: (group, count) => `Show ${group}, ${count} ${count === 1 ? "task" : "tasks"}`,
  },
  empty: {
    all: "No tasks yet",
    scope: "No tasks here",
    filtered: "No tasks match these filters",
  },
}
