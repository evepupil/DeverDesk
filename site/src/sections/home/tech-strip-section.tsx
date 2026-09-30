import { TECH_LOGOS } from "@/content/tech-logos"
import { NewTabHint } from "@/components/site/external-mark"
import { TechIcon } from "@/components/site/tech-icon"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"
import { CONTAINER } from "@/lib/styles"

/** H3 技术栈：两行居中标题 + 12 个开源项目图标。悬停时图标变品牌色、名字变深。 */
export function TechStripSection({ locale }: { locale: Locale }) {
  const t = getMessages(locale)

  return (
    <section id="built-with" className={cn(CONTAINER, "py-10 md:py-20")}>
      <h2 className="mx-auto max-w-xl text-center text-lg font-medium text-neutral-600">
        {t.home.techStrip.title}
        <br />
        <span className="text-neutral-500">{t.home.techStrip.subtitle}</span>
      </h2>

      {/* 图标悬停变品牌色：品牌色经行内 style 写进 --brand 自定义属性，Tailwind 只认完整类名，
          所以用任意值类 text-[var(--brand)] 读它，而不是拼类名。 */}
      <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 md:mt-16 lg:grid-cols-6">
        {TECH_LOGOS.map((logo) => (
          <li key={logo.id}>
            <a
              href={logo.href}
              target="_blank"
              rel="noopener noreferrer"
              data-tech={logo.id}
              style={{ "--brand": logo.hex } as React.CSSProperties}
              className="group flex h-16 items-center justify-center gap-2.5 rounded-lg text-neutral-500 transition-colors hover:text-neutral-900"
            >
              <TechIcon
                path={logo.path}
                title={logo.name}
                className="size-6 shrink-0 text-neutral-400 transition-colors duration-200 group-hover:text-[var(--brand)]"
              />
              <span className="text-sm font-medium whitespace-nowrap">{logo.name}</span>
              <NewTabHint locale={locale} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default TechStripSection
