/** oauth 的界面文字：AI 应用来连接时的授权页（features/oauth） */
export const oauth = {
  /** 名字是来连的应用自报的，ChatGPT、Claude、Cursor 都套这一句 */
  title: (name: string) => `${name} 想连接你的 DeverDesk`,
  /** 后面接跳回的网站 */
  returnTo: "授权后回到",
  /** 跳回本机时用这句，后面接本机地址 */
  returnToLocal: "授权后交给这台电脑上的程序",
  permission: "权限",
  allow: "允许",
  allowing: "允许中…",
  deny: "拒绝",
  redirecting: (host: string) => `正在回到 ${host}…`,
  /** 请求在点允许之前就有错：不自动跳，给一个回去的按钮 */
  requestError: (host: string) => `${host} 发来的授权请求有误`,
  backTo: (host: string) => `回到 ${host}`,
  invalid: (reason: string) => `授权链接无效：${reason}`,
  reasons: {
    client_id: "客户端编号不对",
    unknown_client: "这个客户端没有登记过",
    metadata_unavailable: "读不到客户端的身份说明",
    redirect_uri: "跳回地址和登记的不一致",
  },
  failed: "没能完成授权，再试一次",
  localEdition: "本地版不能连接 AI 应用",
}
