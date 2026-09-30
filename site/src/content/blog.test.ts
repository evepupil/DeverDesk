import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { LOCALES } from "../i18n/locales"
import { coverExists, getAdjacentPosts, getAllPosts, getFeaturedPost, getPost, getPostParams, getPostSlugs, parseFrontmatter, renderMarkdown } from "./blog"

describe("parseFrontmatter", () => {
  it("拆出 YAML 头信息和正文，兼容 Windows 换行", () => {
    const { data, body } = parseFrontmatter("---\r\ntitle: 你好\r\ntags: [a, b]\r\n---\r\n正文第一行\r\n")
    expect(data).toEqual({ title: "你好", tags: ["a", "b"] })
    expect(body).toBe("正文第一行\n")
  })

  it("没有头信息时整段都是正文", () => {
    expect(parseFrontmatter("# 标题")).toEqual({ data: {}, body: "# 标题" })
  })
})

describe("renderMarkdown", () => {
  const { html, headings } = renderMarkdown(
    ["# 大标题", "## 为什么要算时薪", "正文 [仓库](https://github.com/evepupil/DeverDesk)、[别家](https://nextjs.org) 和 [站内](/zh/)", "### Step one", "## 为什么要算时薪", "![截图](/blog/a.webp)", "| a | b |\n|---|---|\n| 1 | 2 |"].join("\n\n"),
  )

  it("目录只收二、三级标题，id 和正文锚点一致，重名加后缀", () => {
    expect(headings).toEqual([
      { id: "为什么要算时薪", text: "为什么要算时薪", depth: 2 },
      { id: "step-one", text: "Step one", depth: 3 },
      { id: "为什么要算时薪-1", text: "为什么要算时薪", depth: 2 },
    ])
    expect(html).toContain('<h2 id="为什么要算时薪">')
    expect(html).toContain('<h2 id="为什么要算时薪-1">')
  })

  it("站外链接新窗口打开（自家仓库留下来源），站内链接不变，图片延迟加载，表格可用", () => {
    expect(html).toContain('<a href="https://github.com/evepupil/DeverDesk" target="_blank" rel="noopener">')
    expect(html).toContain('<a href="https://nextjs.org" target="_blank" rel="noopener noreferrer">')
    expect(html).toContain('<a href="/zh/">')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain("<table>")
  })
})

describe("博客内容", () => {
  const slugs = getPostSlugs()

  it("至少 4 篇，每篇中英文都有", () => {
    expect(slugs.length).toBeGreaterThanOrEqual(4)
    for (const slug of slugs) {
      for (const locale of LOCALES) {
        expect(existsSync(join(process.cwd(), "content", "blog", slug, `${locale}.md`)), `${slug}/${locale}.md`).toBe(true)
      }
    }
    expect(getPostParams()).toHaveLength(slugs.length * LOCALES.length)
  })

  it("头信息齐全、两种语言的日期和封面一致、封面文件存在、每篇至少两个二级标题", () => {
    for (const slug of slugs) {
      const zh = getPost("zh", slug)
      const en = getPost("en", slug)
      expect(zh).not.toBeNull()
      expect(en).not.toBeNull()
      if (!zh || !en) continue
      expect(zh.date).toBe(en.date)
      expect(zh.cover).toBe(en.cover)
      expect(coverExists(zh.cover), zh.cover).toBe(true)
      expect(zh.headings.filter((heading) => heading.depth === 2).length).toBeGreaterThanOrEqual(2)
      expect(en.headings.filter((heading) => heading.depth === 2).length).toBeGreaterThanOrEqual(2)
    }
  })

  it("列表按日期从新到旧，置顶取标了 featured 的那篇", () => {
    for (const locale of LOCALES) {
      const posts = getAllPosts(locale)
      for (let i = 1; i < posts.length; i++) expect(posts[i - 1]!.date >= posts[i]!.date).toBe(true)
      const featured = getFeaturedPost(posts)
      expect(featured).not.toBeNull()
      const marked = posts.filter((post) => post.featured)
      if (marked.length > 0) expect(featured?.slug).toBe(marked[0]?.slug)
    }
  })

  it("上一篇 / 下一篇首尾为空", () => {
    const posts = getAllPosts("zh")
    const first = posts[0]
    const last = posts[posts.length - 1]
    if (!first || !last) return
    expect(getAdjacentPosts("zh", first.slug).newer).toBeNull()
    expect(getAdjacentPosts("zh", last.slug).older).toBeNull()
    expect(getAdjacentPosts("zh", "not-a-post")).toEqual({ newer: null, older: null })
  })
})
