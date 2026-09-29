import { SearchX } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/base/empty-state"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex h-dvh items-center justify-center bg-window">
      <EmptyState
        icon={SearchX}
        title="没有找到这个页面"
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/">回到工作台</Link>
          </Button>
        }
      />
    </main>
  )
}
