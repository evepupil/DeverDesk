import { notFound } from "next/navigation"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { fill, getMessages } from "@/i18n"
import { getAdjacentPosts, getPost, getPostParams } from "@/content/blog"
import { isLocale } from "@/i18n/locales"
import { pageMetadata } from "@/lib/metadata"
import PostArticle from "@/sections/post/post-article"
import PostCta from "@/sections/post/post-cta"
import PostFooter from "@/sections/post/post-footer"

export function generateStaticParams() {
  return getPostParams()
}

export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: localeValue, slug } = await params
  if (!isLocale(localeValue)) notFound()
  const post = getPost(localeValue, slug)
  if (!post) notFound()
  const t = getMessages(localeValue)
  return pageMetadata({
    locale: localeValue,
    path: `/blog/${slug}/`,
    title: fill(t.meta.postTitle, { title: post.title }),
    description: post.description,
    image: post.cover,
    type: "article",
    publishedTime: post.date,
  })
}

export default async function PostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: localeValue, slug } = await params
  if (!isLocale(localeValue)) notFound()
  const locale = localeValue
  const post = getPost(locale, slug)
  if (!post) notFound()
  const { newer, older } = getAdjacentPosts(locale, slug)

  return (
    <>
      <SiteHeader locale={locale} current="blog" />
      <main id="main">
        <PostArticle locale={locale} post={post} />
        <PostFooter locale={locale} post={post} newer={newer} older={older} />
        <PostCta locale={locale} />
      </main>
      <SiteFooter locale={locale} editPath={`site/content/blog/${slug}/${locale}.md`} />
    </>
  )
}
