import { notFound } from "next/navigation"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { getAllPosts, getFeaturedPost } from "@/content/blog"
import { getMessages } from "@/i18n"
import { isLocale } from "@/i18n/locales"
import { pageMetadata } from "@/lib/metadata"
import BlogHeader from "@/sections/blog/blog-header"
import FeaturedPost from "@/sections/blog/featured-post"
import PostList from "@/sections/blog/post-list"

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeValue } = await params
  if (!isLocale(localeValue)) notFound()
  const t = getMessages(localeValue)
  return pageMetadata({ locale: localeValue, path: "/blog/", title: t.meta.blog.title, description: t.meta.blog.description })
}

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeValue } = await params
  if (!isLocale(localeValue)) notFound()
  const locale = localeValue
  const posts = getAllPosts(locale)
  const featured = getFeaturedPost(posts)
  const rest = posts.filter((post) => post.slug !== featured?.slug)

  return (
    <>
      <SiteHeader locale={locale} current="blog" />
      <main id="main">
        <BlogHeader locale={locale} />
        {featured ? <FeaturedPost locale={locale} post={featured} /> : null}
        <PostList locale={locale} posts={rest} />
      </main>
      <SiteFooter locale={locale} editPath="site/content/blog" />
    </>
  )
}
