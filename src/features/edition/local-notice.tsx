"use client"

import { useEffect } from "react"

import { GithubMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DEPLOY_GUIDE_URL, LOCAL_NOTICE_KEY } from "@/lib/edition"
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
          <DialogTitle>你在用本地版</DialogTitle>
          <DialogDescription className="sr-only">数据只存在浏览器里，可以部署在线版做多设备同步</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-4 py-4">
          <p>数据只存在这个浏览器里，不会同步到云端。清除浏览器数据会一起清掉，记得定期从右上角头像菜单导出备份。</p>
          <p>想在手机和电脑之间同步，可以把在线版免费部署到你自己的 Cloudflare，再把备份导进去。</p>
        </div>
        <DialogFooter className="border-t border-line px-4 py-3">
          <Button asChild variant="outline">
            <a href={DEPLOY_GUIDE_URL} target="_blank" rel="noreferrer">
              <GithubMark />
              部署在线版
            </a>
          </Button>
          <Button type="button" onClick={close}>
            知道了
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
