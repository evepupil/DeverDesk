import type { Metadata } from "next"

import { RoutinesPage } from "@/features/routines/routines-page"

export const metadata: Metadata = { title: "例行" }

export default function Page() {
  return <RoutinesPage />
}
