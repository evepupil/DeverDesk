"use client"

import { Languages } from "lucide-react"

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { LOCALE_NAMES, LOCALES, isLocale } from "@/i18n/locales"
import { useLocale, useT } from "@/i18n/react"
import { setLocale } from "@/i18n/runtime"

/** 头像菜单里的语言子菜单；语言名各用各的语言写，不跟着界面语言变 */
export function LanguageMenu() {
  const t = useT()
  const locale = useLocale()
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Languages />
        {t.words.language}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={locale} onValueChange={(value) => isLocale(value) && setLocale(value)}>
          {LOCALES.map((item) => (
            <DropdownMenuRadioItem key={item} value={item} lang={item}>
              {LOCALE_NAMES[item]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
