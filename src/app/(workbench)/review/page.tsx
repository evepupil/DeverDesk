import type { Metadata } from "next"

import { ReviewPage } from "@/features/review/review-page"

export const metadata: Metadata = { title: "回顾" }

export default function Page() {
  return <ReviewPage />
}
