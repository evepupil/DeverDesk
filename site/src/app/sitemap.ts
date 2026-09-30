import type { MetadataRoute } from "next"
import { SITE_URL } from "@/content/site"
import { getPostSlugs } from "@/content/blog"
import { LOCALES, localePath } from "@/i18n/locales"

export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/changelog/", "/blog/", ...getPostSlugs().map((slug) => `/blog/${slug}/`)]

  return LOCALES.flatMap((locale) =>
    paths.map((path) => ({
      url: SITE_URL + localePath(locale, path),
      alternates: {
        languages: {
          "zh-CN": SITE_URL + localePath("zh", path),
          en: SITE_URL + localePath("en", path),
        },
      },
    })),
  )
}