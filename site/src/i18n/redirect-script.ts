import { DEFAULT_LOCALE, LOCALES, LOCALE_STORAGE_KEY } from "./locales"

/**
 * 根地址 / 的跳转脚本：静态导出没有服务端跳转，只能在页面里用一小段脚本选语言再跳。
 * 选法和 pickLocale 一模一样（存过的优先 → 浏览器语言有 zh 开头的用中文 → 其余英文），
 * 这里写成字符串内联进页面，页面一加载就跳，不等框架脚本；redirect-script.test.ts 逐条核对两边一致。
 */
export function redirectScript(): string {
  const locales = JSON.stringify(LOCALES)
  const key = JSON.stringify(LOCALE_STORAGE_KEY)
  const fallback = JSON.stringify(DEFAULT_LOCALE)
  return `(function(){var s=null;try{s=localStorage.getItem(${key})}catch(e){}var ok=${locales};var l=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language||""];var t=ok.indexOf(s)>=0?s:${fallback};if(ok.indexOf(s)<0){for(var i=0;i<l.length;i++){if(String(l[i]).toLowerCase().indexOf("zh")===0){t="zh";break}}}location.replace("/"+t+"/"+(location.hash||""))})();`
}
