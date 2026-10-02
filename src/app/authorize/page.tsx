import { AuthorizeScreen } from "@/features/oauth/authorize-screen"

/** AI 应用（ChatGPT、Claude 等）来连接时的授权页；Worker 给它加上防嵌入的响应头 */
export default function AuthorizePage() {
  return <AuthorizeScreen />
}
