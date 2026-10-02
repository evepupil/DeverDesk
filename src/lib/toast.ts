/**
 * 提示条（sonner）画在侧栏和弹窗的外面。在侧栏里点提示条上的「撤销」，
 * 侧栏会以为是点了外面而把自己关掉，所以侧栏收到「点了外面」时先问一句：点的是不是提示条。
 */
export function ignoreToastInteraction(event: { target: EventTarget | null; preventDefault(): void }): void {
  if (event.target instanceof Element && event.target.closest("[data-sonner-toast]")) event.preventDefault()
}
