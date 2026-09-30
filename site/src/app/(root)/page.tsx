import { redirectScript } from "@/i18n/redirect-script"
import { getMessages } from "@/i18n"
import { LOCALE_NAMES } from "@/i18n/locales"
import { LogoMark } from "@/components/site/logo"
import { buttonClass } from "@/lib/styles"

export default function RootPage() {
  const zh = getMessages("zh")
  const en = getMessages("en")

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: redirectScript() }} />
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <LogoMark className="size-10" />
        <p className="text-sm text-neutral-500">{zh.common.chooseLanguage} · {en.common.chooseLanguage}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a href="/zh/" lang="zh-CN" hrefLang="zh-CN" className={buttonClass("secondary", "md")}>{LOCALE_NAMES.zh}</a>
          <a href="/en/" lang="en" hrefLang="en" className={buttonClass("secondary", "md")}>{LOCALE_NAMES.en}</a>
        </div>
      </main>
    </>
  )
}
