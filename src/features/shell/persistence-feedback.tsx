"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { useT } from "@/i18n/react"

/**
 * 本地保存失败时给出可执行的反馈：说明修改还在，并提供重试。
 * failures 每失败一次加一；retry 返回是否这次存上了。
 */
export function PersistenceFeedback({ failures, retry, id }: { failures: number; retry: () => boolean; id: string }) {
  const t = useT()
  const retryRef = useRef(retry)
  useEffect(() => {
    retryRef.current = retry
  }, [retry])

  useEffect(() => {
    if (failures === 0) return
    toast.error(t.frame.persistence.saveFailed, {
      id,
      description: t.frame.persistence.saveFailedHint,
      duration: Infinity,
      action: {
        label: t.words.retry,
        onClick: () => {
          if (retryRef.current()) toast.success(t.frame.persistence.saved, { id, duration: 2500 })
        },
      },
    })
  }, [failures, id, t])

  return null
}
