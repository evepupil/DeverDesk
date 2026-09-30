/**
 * H6 两种用法：三个设备里的真实截图、一段流动的连线，下面三张卡讲本地版 / 在线版 / 数据归属。
 * 服务端组件：连线光段用全局的 .animate-dash（纯 CSS），世界地图是 Aceternity 的客户端组件，
 * 只传数据（dots、alt、className），不传函数。
 */

import { IconArrowRight, IconBrandCloudflare, IconBrowser, IconCloudUpload, IconDatabaseExport, IconDeviceLaptop, IconLock } from "@tabler/icons-react"
import { WorldMap } from "@/components/aceternity/world-map"
import { MobileScreenshot, Screenshot } from "@/components/site/screenshot"
import { SectionHeading } from "@/components/site/section-heading"
import { DEVICE_KEYS, DEVICE_SHOTS, EDITION_CARD_KEYS, MAP_ARCS } from "@/content/home"
import { getMessages } from "@/i18n"
import type { Locale } from "@/i18n/locales"
import { cn } from "@/lib/cn"
import { CARD_BODY, CARD_SOFT, CARD_TITLE, CONTAINER, SECTION_Y } from "@/lib/styles"

/** 连线底稿：三个设备位置之间的虚线，光段沿同一条 path 流动 */
const CONNECTOR_PATH =
  "M10 20 L90 20 C130 20 140 8 180 8 L260 8 C300 8 310 20 350 20 L450 20 C490 20 500 8 540 8 L620 8 C660 8 670 20 710 20 L790 20"

/** 插画里圆形图标块的统一样式 */
const ART_CIRCLE = "flex size-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5"
/** 插画里的短虚线段 */
const ART_DASH = "h-px w-10 border-t border-dashed border-neutral-300"

function EditionArt({ kind, locale }: { kind: (typeof EDITION_CARD_KEYS)[number]; locale: Locale }) {
  const t = getMessages(locale)

  if (kind === "local") {
    return (
      <div aria-hidden className="relative h-44 overflow-hidden rounded-xl bg-neutral-50 bg-[repeating-linear-gradient(45deg,transparent_0,transparent_7px,rgba(0,0,0,0.035)_7px,rgba(0,0,0,0.035)_8px)]">
        <div className="absolute inset-0 flex items-center justify-center gap-3">
          <div className={ART_CIRCLE}>
            <IconBrowser size={20} stroke={1.75} className="text-neutral-800" />
          </div>
          <div className={ART_DASH} />
          <div className="flex size-10 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-black/5">
            <IconLock size={18} stroke={1.75} className="text-neutral-800" />
          </div>
          <div className={ART_DASH} />
          <div className={ART_CIRCLE}>
            <IconDeviceLaptop size={20} stroke={1.75} className="text-neutral-800" />
          </div>
        </div>
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[11px] text-neutral-600 shadow-sm ring-1 ring-black/5 whitespace-nowrap">
          {t.home.editions.localBrowser}
        </span>
      </div>
    )
  }

  if (kind === "cloud") {
    return (
      <div aria-hidden className="relative h-44 overflow-hidden rounded-xl bg-neutral-50">
        {/* MAP_ARCS 是只读元组，复制成普通数组再传给客户端组件 */}
        <WorldMap
          dots={MAP_ARCS.map((arc) => ({ start: { ...arc.start }, end: { ...arc.end } }))}
          alt={t.home.editions.mapAlt}
          className="absolute inset-0 h-full w-full"
        />
        <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 shadow-sm ring-1 ring-black/5">
          <IconBrandCloudflare size={14} stroke={1.75} />
          Cloudflare
        </span>
      </div>
    )
  }

  return (
    <div aria-hidden className="relative h-44 overflow-hidden rounded-xl bg-neutral-50">
      <div className="absolute inset-0 flex items-center justify-center gap-2.5">
        <div className={ART_CIRCLE}>
          <IconDatabaseExport size={20} stroke={1.75} className="text-neutral-800" />
        </div>
        <span className="rounded-md bg-white px-2.5 py-1.5 font-mono text-[11px] text-neutral-700 shadow-sm ring-1 ring-black/5">
          {t.home.editions.exportFile}
        </span>
        <IconArrowRight size={14} stroke={1.75} className="shrink-0 text-neutral-400" />
        <div className={ART_CIRCLE}>
          <IconCloudUpload size={20} stroke={1.75} className="text-neutral-800" />
        </div>
      </div>
    </div>
  )
}

export function EditionsSection({ locale }: { locale: Locale }) {
  const t = getMessages(locale)

  return (
    <section id="editions" className={cn(CONTAINER, SECTION_Y)}>
      <SectionHeading align="center" title={t.home.editions.title} subtitle={t.home.editions.subtitle} />

      {/* 连线只在 md 以上显示；光段 strokeDasharray 周期 400，和 .animate-dash 的 -400 位移对上，循环无缝 */}
      <div aria-hidden className="mx-auto mt-12 hidden max-w-4xl md:block">
        <svg viewBox="0 0 800 40" className="h-10 w-full" fill="none">
          <path d={CONNECTOR_PATH} className="stroke-neutral-300" strokeWidth="1.5" strokeDasharray="2 4" strokeLinecap="round" />
          <path d={CONNECTOR_PATH} className="stroke-brand-primary animate-dash" strokeWidth="2" strokeDasharray="60 340" strokeLinecap="round" />
          <circle cx="10" cy="20" r="7" className="fill-brand-primary/15" />
          <circle cx="10" cy="20" r="4" className="fill-brand-primary" />
          <circle cx="400" cy="20" r="7" className="fill-brand-primary/15" />
          <circle cx="400" cy="20" r="4" className="fill-brand-primary" />
          <circle cx="790" cy="20" r="7" className="fill-brand-primary/15" />
          <circle cx="790" cy="20" r="4" className="fill-brand-primary" />
        </svg>
      </div>

      <div className="mx-auto mt-6 grid max-w-5xl grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
        {DEVICE_KEYS.map((key) => (
          <div key={key} data-device={key} className="flex flex-col items-center text-center">
            <div className="flex h-[210px] items-end justify-center">
              {key === "phone" ? (
                <div className="relative h-[200px] w-[100px] overflow-hidden rounded-[22px] border-[5px] border-neutral-200 bg-white shadow-sm">
                  <MobileScreenshot locale={locale} alt={t.home.editions.phoneAlt} className="h-full w-full object-cover object-top" />
                  <span className="absolute bottom-1.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-neutral-300" />
                </div>
              ) : key === "laptop" ? (
                <div>
                  <div className="h-[150px] w-[240px] overflow-hidden rounded-t-xl border-[5px] border-b-0 border-neutral-200 bg-white">
                    <Screenshot name={DEVICE_SHOTS.laptop} locale={locale} alt={t.home.editions.laptopAlt} className="h-full w-full object-cover object-left-top" />
                  </div>
                  {/* 底座比屏幕宽 60px（左右各多 30px），再画一个凹槽 */}
                  <div className="relative mx-auto h-3 w-[300px] -translate-x-[30px] rounded-b-xl bg-neutral-200">
                    <span className="absolute top-0 left-1/2 h-1 w-12 -translate-x-1/2 rounded-b-md bg-neutral-300" />
                  </div>
                </div>
              ) : (
                <div className="h-[160px] w-[224px] overflow-hidden rounded-2xl border-[5px] border-neutral-200 bg-white shadow-sm">
                  <Screenshot name={DEVICE_SHOTS.tablet} locale={locale} alt={t.home.editions.tabletAlt} className="h-full w-full object-cover object-left-top" />
                </div>
              )}
            </div>
            <h3 className="mt-6 text-base font-medium text-neutral-900">{t.home.editions.devices[key].title}</h3>
            <p className="mt-2 max-w-[240px] text-sm text-balance text-neutral-600">{t.home.editions.devices[key].body}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 md:mt-20 md:grid-cols-3">
        {EDITION_CARD_KEYS.map((key) => (
          <article key={key} data-edition={key} className={cn(CARD_SOFT, "p-6")}>
            <EditionArt kind={key} locale={locale} />
            <h3 className={cn(CARD_TITLE, "mt-6")}>{t.home.editions.cards[key].title}</h3>
            <p className={CARD_BODY}>{t.home.editions.cards[key].body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default EditionsSection
