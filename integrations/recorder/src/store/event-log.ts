// 事件日志：~/.deverdesk/events/YYYY-MM-DD.jsonl，只追加。规格见 docs/模块设计/本机记录器.md「本机文件」。
// 占位：由「记录器外壳」那一路实现。
import type { RecorderEvent } from "../core/types"

/** 追加一个事件（一次 appendFileSync 写一整行，行长超过 4 KB 就截断 text / summary / body） */
export function appendEvent(home: string, event: RecorderEvent): void {
  void home
  void event
  throw new Error("appendEvent 还没实现")
}

/** 读最近 days 天的事件（days 为 undefined 读全部），按「agent|会话|种类|时间|提交号」去重，按时间排序；坏行跳过 */
export function readEvents(home: string, options: { days?: number; now?: number }): RecorderEvent[] {
  void home
  void options
  throw new Error("readEvents 还没实现")
}
