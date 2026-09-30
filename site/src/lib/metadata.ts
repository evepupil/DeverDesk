import type { Metadata } from "next"
import { OG_LOCALE, localePath, type Locale } from "@/i18n/locales"
import { SITE_URL } from "@/content/site"

type PageMetadataInput = {
  locale: Locale
  path: string
  title: string
  description: string
  image?: string
  type?: "website" | "article"
  publishedTime?: string
}

export function pageMetadata({
  locale,
  path,
  title,
  description,
  image,
  type = "website",
  publishedTime,
}: PageMetadataInput): Metadata {
  const shareImage = image ?? `/og/${locale}.png`
  const openGraph: NonNullable<Metadata["openGraph"]> =
    type === "article"
      ? {
          type: "article",
          siteName: "DeverDesk",
          locale: OG_LOCALE[locale],
          url: localePath(locale, path),
          title,
          description,
          images: [shareImage],
          publishedTime,
        }
      : {
          type: "website",
          siteName: "DeverDesk",
          locale: OG_LOCALE[locale],
          url: localePath(locale, path),
          title,
          description,
          images: [shareImage],
        }

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {
      canonical: localePath(locale, path),
      languages: {
        "zh-CN": localePath("zh", path),
        en: localePath("en", path),
        "x-default": localePath("en", path),
      },
    },
    openGraph,
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [shareImage],
    },
    icons: { icon: "/favicon.svg" },
  }
}
