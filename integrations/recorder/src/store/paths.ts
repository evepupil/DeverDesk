import { homedir } from "node:os"
import { join } from "node:path"

/** 根目录：环境变量 DEVERDESK_HOME，没有就是 ~/.deverdesk */
export function recorderHome(env: Record<string, string | undefined> = process.env): string {
  const configured = env.DEVERDESK_HOME?.trim()
  return configured || join(homedir(), ".deverdesk")
}
