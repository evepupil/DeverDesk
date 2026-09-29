"use client"

import { createContext, useContext, type ReactNode } from "react"

/** 视图栏最左边的归属，比如「我的工作台」 */
export interface ShellCrumb {
  icon: ReactNode
  label: string
}

const CrumbContext = createContext<ShellCrumb | null>(null)

export function CrumbProvider({ crumb, children }: { crumb: ShellCrumb; children: ReactNode }) {
  return <CrumbContext.Provider value={crumb}>{children}</CrumbContext.Provider>
}

export function useShellCrumb(): ShellCrumb | null {
  return useContext(CrumbContext)
}
