"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

/**
 * 本地保存失败时给出可执行的反馈：说明修改还在，并提供重试。
 * failures 每失败一次加一；retry 返回是否这次存上了。
 */
export function PersistenceFeedback({ failures, retry, id }: { failures: number; retry: () => boolean; id: string }) {
  const retryRef = useRef(retry)
  useEffect(() => {
    retryRef.current = retry
  }, [retry])

  useEffect(() => {
    if (failures === 0) return
    toast.error("没能保存到本机", {
      id,
      description: "修改在关闭页面前仍然有效",
      duration: Infinity,
      action: {
        label: "重试",
        onClick: () => {
          if (retryRef.current()) toast.success("已保存到本机", { id, duration: 2500 })
        },
      },
    })
  }, [failures, id])

  return null
}
