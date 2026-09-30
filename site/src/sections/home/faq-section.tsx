"use client"

import { IconPlus } from "@tabler/icons-react"
import { motion } from "motion/react"
import { useState } from "react"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { NewTabHint } from "@/components/site/external-mark"
import { SectionHeading } from "@/components/site/section-heading"
import { FAQ_GROUP_KEYS } from "@/content/home"
import { NEW_ISSUE_URL } from "@/content/site"
import { usePrefersReducedMotion } from "@/lib/motion"

export function FaqSection({ locale }: { locale: Locale }) {
  const t = getMessages(locale)
  const reduce = usePrefersReducedMotion()
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())

  // 不可变更新让每题独立开合；答案只折叠并设为 inert，不从静态 HTML 移除。
  const toggleQuestion = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section id="faq" className="mx-auto max-w-4xl px-4 py-20 md:px-8 md:py-32">
      <SectionHeading align="center" title={t.home.faq.title} />
      <p className="mt-2 text-center text-sm text-neutral-600 md:text-base lg:text-lg">
        {t.home.faq.subtitle}{" "}
        <a
          href={NEW_ISSUE_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-faq-ask
          className="font-medium text-brand-deep underline-offset-4 hover:underline"
        >
          {t.home.faq.askLink}
          <NewTabHint locale={locale} />
        </a>
      </p>

      <div className="mt-12 space-y-12 md:mt-16">
        {FAQ_GROUP_KEYS.map((group) => {
          const section = t.home.faq.groups[group]
          return (
            <div key={group} data-faq-group={group}>
              <h3 className="mb-4 px-4 text-lg font-medium text-neutral-800">{section.title}</h3>
              <ul className="space-y-1">
                {section.items.map((item, index) => {
                  const id = `${group}-${index}`
                  const questionId = `faq-q-${id}`
                  const answerId = `faq-a-${id}`
                  const open = openIds.has(id)

                  return (
                    <li key={id}>
                      <button
                        type="button"
                        id={questionId}
                        aria-expanded={open}
                        aria-controls={answerId}
                        data-faq-question={id}
                        onClick={() => toggleQuestion(id)}
                        className="flex w-full items-center justify-between gap-6 rounded-xl px-4 py-5 text-left text-base font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
                      >
                        <span>{item.q}</span>
                        <motion.span
                          animate={{ rotate: open ? 45 : 0 }}
                          transition={{ duration: reduce ? 0 : 0.25 }}
                          className="shrink-0 text-neutral-500"
                        >
                          <IconPlus size={18} stroke={1.75} aria-hidden />
                        </motion.span>
                      </button>
                      <motion.div
                        id={answerId}
                        role="region"
                        aria-labelledby={questionId}
                        initial={false}
                        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                        transition={{ duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                        inert={!open}
                      >
                        <p className="px-4 pb-5 text-sm leading-relaxed text-neutral-600 md:text-base">{item.a}</p>
                      </motion.div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default FaqSection
