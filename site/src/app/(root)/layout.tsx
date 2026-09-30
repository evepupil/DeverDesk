import type { Metadata } from "next"
import "../globals.css"
import { SITE_URL } from "@/content/site"
import { localePath } from "@/i18n/locales"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "DeverDesk",
  alternates: {
    languages: {
      "zh-CN": localePath("zh"),
      en: localePath("en"),
      "x-default": localePath("en"),
    },
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-white font-sans text-neutral-700 antialiased">{children}</body>
    </html>
  )
}
