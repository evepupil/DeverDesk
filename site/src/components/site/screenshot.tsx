import { cn } from "@/lib/cn"
import { DESKTOP_SHOT, MOBILE_SHOT, mobileShotSrc, shotSrc, type ShotName } from "@/content/screenshots"
import type { Locale } from "@/i18n/locales"

type ScreenshotProps = {
  name: ShotName
  locale: Locale
  alt: string
  className?: string
  eager?: boolean
}

type MobileScreenshotProps = {
  locale: Locale
  alt: string
  className?: string
}

export function Screenshot({ name, locale, alt, className, eager = false }: ScreenshotProps) {
  return (
    <img
      src={shotSrc(name, locale)}
      width={DESKTOP_SHOT.width}
      height={DESKTOP_SHOT.height}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("block h-auto w-full", className)}
    />
  )
}

export function MobileScreenshot({ locale, alt, className }: MobileScreenshotProps) {
  return (
    <img
      src={mobileShotSrc(locale)}
      width={MOBILE_SHOT.width}
      height={MOBILE_SHOT.height}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("block h-auto w-full", className)}
    />
  )
}
