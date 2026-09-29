import type { ReactNode } from "react"

import { AuthGate } from "@/features/auth/auth-gate"
import { LocaleBoundary } from "@/features/shell/locale-boundary"
import { WorkbenchShell } from "@/features/shell/workbench-shell"

export default function WorkbenchLayout({ children }: { children: ReactNode }) {
  return (
    <LocaleBoundary>
      <AuthGate>
        <WorkbenchShell>{children}</WorkbenchShell>
      </AuthGate>
    </LocaleBoundary>
  )
}
