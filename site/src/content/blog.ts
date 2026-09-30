import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import rehypeSlug from "rehype-slug"
import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { parse as parseYaml } from "yaml"
import { LOCALES, type Locale } from "../i18n/locales"
import { readingMinutes } from "./format"
import { externalRel } from "../lib/links"

/**
 * 博客：每篇文章一个目录 content/blog/<slug>/，里面 zh.md、en.md 各一份，slug 两种语言共用。
 * 文件开头是 YAML 头信息（title、description、date、tags、cover、coverAlt、author、featured），
 * 正文是 Markdown。打包时在服务端读文件、转成 HTML，并抽出二、三级标题做目录。
 * 只在服务端（页面组件、generateStaticParams、generateMetadata）调用，不要在客户端组件里 import。
 */

export interface PostMeta {
  slug: string
  locale: Locale
  title: string
  description: string
  /** YYYY-MM-DD */
  date: string
  tags: string[]
  /** public 下的封面地址，如 /blog/hourly-rate.webp */
  cover: string
  coverAlt: string
  author: string
  /** 列表页置顶大卡；都没标时取最新一篇 */
  featured: boolean
  readingMinutes: number
}

export interface PostHeading {
  id: string
  text: string
  depth: 2 | 3
}

export interface Post extends PostMeta {
  html: string
  headings: PostHeading[]
}

const BLOG_DIR = join(process.cwd(), "content", "blog")
const PUBLIC_DIR = join(process.cwd(), "public")

/** 拆出 --- 包起来的 YAML 头信息和正文 */
export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const normalized = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n")
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized)
  if (!match) return { data: {}, body: normalized }
  const data = parseYaml(match[1] ?? "") as unknown
  return {
    data: data !== null && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {},
    body: match[2] ?? "",
  }
}

interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? ""
  return (node.children ?? []).map(textOf).join("")
}

/** rehype 插件：收集带 id 的 h2、h3（id 由 rehype-slug 生成，目录和正文锚点一定对得上） */
function collectHeadings(target: PostHeading[]) {
  return () => (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (node.type === "element" && (node.tagName === "h2" || node.tagName === "h3")) {
        const id = node.properties?.id
        if (typeof id === "string") target.push({ id, text: textOf(node).trim(), depth: node.tagName === "h2" ? 2 : 3 })
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

/** rehype 插件：站外链接新窗口打开；图片延迟加载 */
function decorateElements() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (node.type === "element" && node.tagName === "a") {
        const href = node.properties?.href
        if (typeof href === "string" && /^https?:\/\//.test(href)) {
          node.properties = { ...node.properties, target: "_blank", rel: externalRel(href) }
        }
      }
      if (node.type === "element" && node.tagName === "img") {
        node.properties = { ...node.properties, loading: "lazy", decoding: "async" }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

/** 把 Markdown 正文转成 HTML，同时给出目录和纯文字（算阅读时长用） */
export function renderMarkdown(body: string): { html: string; headings: PostHeading[]; text: string } {
  const headings: PostHeading[] = []
  const html = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(collectHeadings(headings))
    .use(decorateElements)
    .use(rehypeStringify)
    .processSync(body)
    .toString()
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
  return { html, headings, text }
}

function requireString(data: Record<string, unknown>, key: string, file: string): string {
  const value = data[key]
  if (typeof value === "string" && value.trim() !== "") return value.trim()
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  throw new Error(`博客 ${file} 缺少头信息 ${key}`)
}

function toMeta(slug: string, locale: Locale, data: Record<string, unknown>, text: string, file: string): PostMeta {
  const date = requireString(data, "date", file)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`博客 ${file} 的 date 应为 YYYY-MM-DD：${date}`)
  const tags = Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : []
  return {
    slug,
    locale,
    title: requireString(data, "title", file),
    description: requireString(data, "description", file),
    date,
    tags,
    cover: requireString(data, "cover", file),
    coverAlt: requireString(data, "coverAlt", file),
    author: typeof data.author === "string" && data.author.trim() ? data.author.trim() : "DeverDesk",
    featured: data.featured === true,
    readingMinutes: readingMinutes(text, locale),
  }
}

function fileOf(slug: string, locale: Locale): string {
  return join(BLOG_DIR, slug, `${locale}.md`)
}

/** 所有文章的 slug（按目录名排序），两种语言共用 */
export function getPostSlugs(): string[] {
  if (!existsSync(BLOG_DIR)) return []
  return readdirSync(BLOG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function readPost(locale: Locale, slug: string): { meta: PostMeta; html: string; headings: PostHeading[] } | null {
  const file = fileOf(slug, locale)
  if (!existsSync(file)) return null
  const { data, body } = parseFrontmatter(readFileSync(file, "utf8"))
  const { html, headings, text } = renderMarkdown(body)
  return { meta: toMeta(slug, locale, data, text, file), html, headings }
}

/** 读一篇；这种语言没有这篇时返回 null */
export function getPost(locale: Locale, slug: string): Post | null {
  const post = readPost(locale, slug)
  return post ? { ...post.meta, html: post.html, headings: post.headings } : null
}

/** 某种语言的全部文章，新的在前；同一天的按 slug 排 */
export function getAllPosts(locale: Locale): PostMeta[] {
  const posts: PostMeta[] = []
  for (const slug of getPostSlugs()) {
    const post = readPost(locale, slug)
    if (post) posts.push(post.meta)
  }
  return posts.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)))
}

/** 列表页置顶的那篇：标了 featured 的最新一篇，没有就取最新一篇 */
export function getFeaturedPost(posts: PostMeta[]): PostMeta | null {
  return posts.find((post) => post.featured) ?? posts[0] ?? null
}

/** 文章页底部的「上一篇 / 下一篇」：newer 更新、older 更早 */
export function getAdjacentPosts(locale: Locale, slug: string): { newer: PostMeta | null; older: PostMeta | null } {
  const posts = getAllPosts(locale)
  const index = posts.findIndex((post) => post.slug === slug)
  if (index < 0) return { newer: null, older: null }
  return { newer: posts[index - 1] ?? null, older: posts[index + 1] ?? null }
}

/** 所有语言 × 所有文章，给 generateStaticParams 用 */
export function getPostParams(): Array<{ locale: Locale; slug: string }> {
  return LOCALES.flatMap((locale) => getPostSlugs().filter((slug) => existsSync(fileOf(slug, locale))).map((slug) => ({ locale, slug })))
}

/** 封面文件是否真的在 public 下（单测用） */
export function coverExists(cover: string): boolean {
  return existsSync(join(PUBLIC_DIR, cover.replace(/^\/+/, "")))
}
