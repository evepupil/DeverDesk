import type { ReactNode } from "react"

/** 详情侧栏里的两种排版：左标签右控件的属性行、带小标题的分段 */

export function SheetProperty({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <>
      <dt className="flex h-8 items-center text-sm text-fg-2">
        <label htmlFor={htmlFor}>{label}</label>
      </dt>
      <dd className="flex min-h-8 min-w-0 items-center">{children}</dd>
    </>
  )
}

export function SheetSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3">
      <div className="flex min-h-5 items-center justify-between gap-2 pb-2">
        <h3 className="text-xs font-medium text-fg-2">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
