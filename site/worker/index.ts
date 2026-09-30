/**
 * 官网的 Worker：只有根地址 / 会先进这里（wrangler.jsonc 里的 run_worker_first），
 * 在服务端按语言跳到 /zh/ 或 /en/；其余地址不经过这里，直接由静态资源返回 out/ 里的文件。
 */
import { rootRedirect } from "../src/i18n/root-redirect"

type Env = {
  /** 静态资源绑定：out/ 目录 */
  ASSETS: { fetch(request: Request): Promise<Response> }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return rootRedirect(request) ?? env.ASSETS.fetch(request)
  },
}

export default worker
