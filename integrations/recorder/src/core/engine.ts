// 引擎入口：事件 → 到站的任务 + 进行中的窗口。纯函数。规格见 docs/模块设计/编程自动记录.md「精确规则」。
// 占位：由「引擎」那一路实现。
import type { EngineResult, RecorderEvent } from "./types"

/**
 * @param events 所有窗口、所有目录（含没绑定的）的事件，顺序随意（内部按时间排，同一时刻保持输入顺序）；已按「agent|会话|种类|时间|提交号」去重
 * @param now 当前时间（毫秒）。引擎内部只算到 now − SETTLE_LAG
 */
export function computeTasks(events: readonly RecorderEvent[], now: number): EngineResult {
  void events
  void now
  throw new Error("computeTasks 还没实现")
}
