// Codex 会话记录（rollout-*.jsonl）→ 回填事件。规格见 docs/模块设计/编程记录接入.md「Codex」。
// 占位：由「回填」那一路实现。
import type { RecorderEvent } from "../core/types"
import type { BackfillOptions, BackfillStats } from "./claude-code-backfill"

/** root 默认 $CODEX_HOME/sessions 或 ~/.codex/sessions */
export async function* backfillCodex(options: BackfillOptions, stats: BackfillStats): AsyncGenerator<RecorderEvent> {
  void options
  void stats
  throw new Error("backfillCodex 还没实现")
}
