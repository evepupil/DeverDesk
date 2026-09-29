import type { Messages } from "../types"

export const ledger: Messages["ledger"] = {
  totals: {
    income: "Income",
    expense: "Expenses",
    net: "Net",
    pendingOnTheWay: (amount) => `${amount} on the way`,
  },
  group: {
    label: "Group",
    month: "Month",
    project: "Project",
    category: "Category",
    pending: "Pending",
    personal: "Personal",
    deletedProject: "Deleted project",
  },
  page: {
    newEntry: "New entry",
    export: "Export",
    tabAll: "All",
    empty: "No entries yet",
    emptyFiltered: "No entries match the filters",
    clearFilters: "Clear filters",
  },
  export: {
    fileName: "Ledger",
    headers: ["Date", "Type", "Amount", "Status", "Project", "Category", "Channel", "Expected", "Note"],
    kindIncome: "Income",
    kindExpense: "Expense",
    success: (count) => `Exported ${count} ${count === 1 ? "entry" : "entries"}`,
  },
  row: {
    menu: (note) => `Actions for "${note}"`,
    markReceived: "Mark received",
    receivedToast: (amount) => `Received ${amount}`,
    markRefunded: "Mark refunded",
    refundedToast: "Marked as refunded",
    markBackReceived: "Mark received again",
    backReceivedToast: "Back to received",
    deletedToast: "Entry deleted",
    undo: "Undo",
    overdue: (days) => `${days} ${days === 1 ? "day" : "days"} overdue`,
    overdueCompact: (days) => `${days}d overdue`,
    due: (date) => `Due ${date}`,
  },
}
