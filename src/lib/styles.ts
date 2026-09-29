/**
 * 共用的焦点样式。Tailwind 4 里去掉默认描边会把描边样式变量设成「无」，
 * 所以焦点描边必须同时声明实线，否则键盘焦点看不见。
 */
export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)"

/** 贴着元素内侧画的焦点描边，用在整行、整块可点的区域 */
export const focusRingInset =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)"
