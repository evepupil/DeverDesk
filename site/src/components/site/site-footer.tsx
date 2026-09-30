import { IconBrandGithub, IconPencil } from "@tabler/icons-react"
import { getMessages } from "@/i18n"
import { HTML_LANG, LOCALE_NAMES, LOCALES, localePath, type Locale } from "@/i18n/locales"
import { APP_URL, CONTRIBUTING_URL, DEPLOY_URL, LICENSE_URL, NEW_ISSUE_URL, REPO_URL, deployGuideUrl, editUrl } from "@/content/site"
import { cn } from "@/lib/cn"
import { CONTAINER } from "@/lib/styles"
import { LocaleSwitch } from "./locale-switch"
import { LogoMark } from "./logo"
import { NewTabHint } from "./external-mark"

type FooterLinkItem = {
  href: string
  label: string
  external?: boolean
}

function FooterColumn({ title, links, locale }: { title: string; links: FooterLinkItem[]; locale: Locale }) {
  return (
    <div>
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={`${link.href}-${link.label}`}>
            <a
              href={link.href}
              {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="text-sm text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {link.label}
              {link.external ? <NewTabHint locale={locale} /> : null}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SiteFooter({ locale, editPath }: { locale: Locale; editPath: string }) {
  const t = getMessages(locale)
  const columns = t.footer.columns

  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className={cn(CONTAINER, "pt-16 md:pt-20")}>
        <div className="grid gap-12 md:grid-cols-[1.1fr_2fr]">
          <div>
            <a href={localePath(locale)} className="inline-flex items-center gap-2">
              <LogoMark className="size-7" />
              <span className="text-base font-semibold text-neutral-900">DeverDesk</span>
            </a>
            <p className="mt-3 max-w-xs text-sm text-neutral-600">{t.footer.tagline}</p>
            <div className="mt-6 flex items-center gap-2">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.common.githubAria}
                className="flex size-9 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                <IconBrandGithub size={18} stroke={1.75} aria-hidden />
                <NewTabHint locale={locale} />
              </a>
              <LocaleSwitch locale={locale} />
            </div>
            <p className="mt-6 text-sm text-neutral-500">{t.footer.copyright}</p>
            <a
              href={editUrl(editPath)}
              target="_blank"
              rel="noopener noreferrer"
              data-edit-link
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
            >
              <IconPencil size={14} stroke={1.75} aria-hidden />
              {t.footer.edit}
              <NewTabHint locale={locale} />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <FooterColumn
              title={columns.product.title}
              locale={locale}
              links={[
                { href: localePath(locale, "/#features"), label: columns.product.features },
                { href: localePath(locale, "/#tour"), label: columns.product.tour },
                { href: localePath(locale, "/#faq"), label: columns.product.faq },
                { href: APP_URL, label: columns.product.demo, external: true },
              ]}
            />
            <FooterColumn
              title={columns.openSource.title}
              locale={locale}
              links={[
                { href: REPO_URL, label: columns.openSource.repo, external: true },
                { href: LICENSE_URL, label: columns.openSource.license, external: true },
                { href: NEW_ISSUE_URL, label: columns.openSource.issue, external: true },
                { href: CONTRIBUTING_URL, label: columns.openSource.contributing, external: true },
              ]}
            />
            <FooterColumn
              title={columns.resources.title}
              locale={locale}
              links={[
                { href: localePath(locale, "/blog/"), label: columns.resources.blog },
                { href: localePath(locale, "/changelog/"), label: columns.resources.changelog },
                { href: deployGuideUrl(locale), label: columns.resources.deployGuide, external: true },
                { href: DEPLOY_URL, label: columns.resources.oneClick, external: true },
              ]}
            />
            <div>
              <p className="text-sm font-semibold text-neutral-900">{columns.language.title}</p>
              <ul className="mt-4 space-y-3">
                {LOCALES.map((target) => (
                  <li key={target}>
                    <a
                      href={localePath(target)}
                      lang={HTML_LANG[target]}
                      hrefLang={HTML_LANG[target]}
                      className={cn("text-sm text-neutral-600 transition-colors hover:text-neutral-900", locale === target && "font-medium text-neutral-900")}
                    >
                      {LOCALE_NAMES[target]}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div aria-hidden className="pointer-events-none mt-16 overflow-hidden select-none">
          <p className="text-outline translate-y-[18%] text-center text-[19vw] leading-none font-bold tracking-tighter xl:text-[240px]">DeverDesk</p>
        </div>
      </div>
    </footer>
  )
}
