import type { ReactNode } from "react"

import { WorkbenchShell } from "@/features/shell/workbench-shell"

export default function WorkbenchLayout({ children }: { children: ReactNode }) {
  return <WorkbenchShell>{children}</WorkbenchShell>
}
