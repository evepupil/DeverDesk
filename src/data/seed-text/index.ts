import { getLocale } from "@/i18n/runtime"
import { en } from "./en"
import { zhCN } from "./zh-CN"

export function getSeedText() {
  return getLocale() === "en" ? en : zhCN
}
