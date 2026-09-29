"use client"

import { TriangleAlert } from "lucide-react"

import { EmptyState } from "@/components/base/empty-state"
import { Button } from "@/components/ui/button"

/** 页面出错：说清楚出了问题，并给出重试 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      tone="error"
      title="这个页面没能加载出来"
      className="h-full"
      action={
        <Button variant="outline" size="sm" onClick={reset}>
          重试
        </Button>
      }
    />
  )
}
