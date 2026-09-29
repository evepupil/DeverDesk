import type { Metadata } from "next"

import { WeekPage } from "@/features/week/week-page"

export const metadata: Metadata = { title: "本周" }

export default function Page() {
  return <WeekPage />
}
