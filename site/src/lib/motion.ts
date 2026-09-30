"use client"

import { useSyncExternalStore } from "react"

/**
 * 访客是否开了「减少动态效果」。服务端渲染和浏览器接管页面的那一次都当作「没开」，
 * 接管完成后再按系统设置更新，这样两边第一次画出来的东西一模一样，不会报水合错误。
 */
const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
}
