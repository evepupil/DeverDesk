"use client"

import { useRef, useState, type DragEvent } from "react"

import { TASK_DRAG_TYPE } from "./task-card"

function accepts(event: DragEvent) {
  return event.dataTransfer.types.includes(TASK_DRAG_TYPE)
}

/**
 * 让一块区域可以接住拖进来的任务：拖到上方时高亮，松手时把任务编号交给 onDropTask。
 * 进出子元素时浏览器会连发 enter / leave，用计数避免高亮闪烁。
 */
export function useTaskDrop(onDropTask: (taskId: string) => void) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)

  return {
    over,
    dropProps: {
      onDragEnter: (event: DragEvent<HTMLElement>) => {
        if (!accepts(event)) return
        depth.current += 1
        setOver(true)
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!accepts(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!accepts(event)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!accepts(event)) return
        event.preventDefault()
        depth.current = 0
        setOver(false)
        const taskId = event.dataTransfer.getData(TASK_DRAG_TYPE)
        if (taskId) onDropTask(taskId)
      },
    },
  }
}
