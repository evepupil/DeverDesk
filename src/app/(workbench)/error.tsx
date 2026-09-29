"use client"

import { TriangleAlert } from "lucide-react"

import { EmptyState } from "@/components/base/empty-state"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/react"

/** 页面出错：说清楚出了问题，并给出重试 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT()
  return (
    <EmptyState
      icon={TriangleAlert}
      tone="error"
      title={t.app.errorTitle}
      className="h-full"
      action={
        <Button variant="outline" size="sm" onClick={reset}>
          {t.words.retry}
        </Button>
      }
    />
  )
}
