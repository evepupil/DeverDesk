"use client"

import { useEffect } from "react"

import { GithubMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LOCAL_NOTICE_KEY, deployGuideUrl } from "@/lib/edition"
import { useLocale, useT } from "@/i18n/react"
import { useUi } from "@/state/ui"

/** 浏览器里有没有看过说明；读不到存储时当成看过，免得反复弹 */
function noticed(): boolean {
  try {
    return window.localStorage.getItem(LOCAL_NOTICE_KEY) !== null
  } catch {
    return true
  }
}

function remember() {
  try {
    window.localStorage.setItem(LOCAL_NOTICE_KEY, "1")
  } catch {
    // 存不上不影响使用
  }
}

/** 本地版说明：第一次打开自动弹一次，之后从品牌菜单还能再打开 */
export function LocalNotice() {
  const t = useT()
  const locale = useLocale()
  const open = useUi((state) => state.localNoticeOpen)
  const setOpen = useUi((state) => state.setLocalNoticeOpen)

  const close = () => {
    setOpen(false)
    remember()
  }

  useEffect(() => {
    if (!noticed()) setOpen(true)
  }, [setOpen])

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="gap-0 p-0 sm:max-w-[420px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>{t.edition.localNotice.title}</DialogTitle>
          <DialogDescription className="sr-only">{t.edition.localNotice.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-4 py-4">
          <p>{t.edition.localNotice.body1}</p>
          <p>{t.edition.localNotice.body2}</p>
        </div>
        <DialogFooter className="border-t border-line px-4 py-3">
          {/* 自家仓库的 README：只写 noopener，留下来源，GitHub 流量页能看到从演示站来的人 */}
          <Button asChild variant="outline">
            <a href={deployGuideUrl(locale)} target="_blank" rel="noopener">
              <GithubMark />
              {t.edition.localNotice.deploy}
            </a>
          </Button>
          <Button type="button" onClick={close}>
            {t.edition.localNotice.dismiss}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
