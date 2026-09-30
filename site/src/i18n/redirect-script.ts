import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE } from "./locales"

/**
 * 根地址 / 的兜底跳转脚本。部署在 Cloudflare 上时，根地址由 Worker 在服务端跳（见 root-redirect.ts），浏览器根本拿不到这一页；
 * 放到别的静态托管上没有服务端跳转，才靠这一小段脚本选语言再跳。
 * 选法和 pickLocale 一模一样（Cookie 里记过的优先 → 浏览器语言有 zh 开头的用中文 → 其余英文），查询参数和锚点原样带过去；
 * 这里写成字符串内联进页面，页面一加载就跳，不等框架脚本；redirect-script.test.ts 逐条核对两边一致。
 */
export function redirectScript(): string {
  const locales = JSON.stringify(LOCALES)
  const prefix = `${LOCALE_COOKIE}=`
  const fallback = JSON.stringify(DEFAULT_LOCALE)
  return `(function(){var s=null;try{var c=document.cookie.split(";");for(var j=0;j<c.length;j++){var p=c[j].replace(/^\\s+|\\s+$/g,"");if(p.indexOf(${JSON.stringify(prefix)})===0){s=p.slice(${prefix.length});break}}}catch(e){}var ok=${locales};var l=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language||""];var t=ok.indexOf(s)>=0?s:${fallback};if(ok.indexOf(s)<0){for(var i=0;i<l.length;i++){if(String(l[i]).toLowerCase().indexOf("zh")===0){t="zh";break}}}location.replace("/"+t+"/"+(location.search||"")+(location.hash||""))})();`
}
