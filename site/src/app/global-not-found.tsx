import "./globals.css"
import { getMessages } from "@/i18n"
import { LogoMark } from "@/components/site/logo"
import { buttonClass } from "@/lib/styles"

export const metadata = { title: "404 · DeverDesk" }

export default function GlobalNotFound() {
  const zh = getMessages("zh")
  const en = getMessages("en")

  return (
    <html lang="en">
      <body className="bg-white font-sans text-neutral-700 antialiased">
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
          <LogoMark className="size-10" />
          <p className="font-mono text-sm text-neutral-500">404</p>
          <h1 lang="zh-CN" className="text-2xl tracking-tight text-neutral-700 md:text-4xl">{zh.notFound.title}</h1>
          <h2 lang="en" className="text-2xl tracking-tight text-neutral-700 md:text-4xl">{en.notFound.title}</h2>
          <p className="text-sm text-neutral-600">{zh.notFound.body} / {en.notFound.body}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href="/zh/" lang="zh-CN" className={buttonClass("primary", "md")}>{zh.notFound.home}</a>
            <a href="/en/" lang="en" className={buttonClass("secondary", "md")}>{en.notFound.home}</a>
          </div>
        </main>
      </body>
    </html>
  )
}
