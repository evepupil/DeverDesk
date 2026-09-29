"use client"

import { SearchX } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/base/empty-state"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/react"

export default function NotFound() {
  const t = useT()
  return (
    <main className="flex h-dvh items-center justify-center bg-window">
      <EmptyState
        icon={SearchX}
        title={t.app.notFoundTitle}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/">{t.app.backToWorkbench}</Link>
          </Button>
        }
      />
    </main>
  )
}
