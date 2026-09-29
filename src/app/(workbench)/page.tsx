import type { Metadata } from "next"

import { TodayPage } from "@/features/today/today-page"

export const metadata: Metadata = { title: "今天" }

export default function Page() {
  return <TodayPage />
}
