import type { Metadata } from "next"

import { LedgerPage } from "@/features/ledger/ledger-page"

export const metadata: Metadata = { title: "收支" }

export default function Page() {
  return <LedgerPage />
}
