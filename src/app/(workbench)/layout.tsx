import type { ReactNode } from "react"

import { AuthGate } from "@/features/auth/auth-gate"
import { WorkbenchShell } from "@/features/shell/workbench-shell"

export default function WorkbenchLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <WorkbenchShell>{children}</WorkbenchShell>
    </AuthGate>
  )
}
