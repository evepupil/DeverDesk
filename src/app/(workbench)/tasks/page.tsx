import type { Metadata } from "next"

import { TasksPage } from "@/features/tasks/tasks-page"

export const metadata: Metadata = { title: "任务" }

export default function Page() {
  return <TasksPage />
}
