// Claude Code 会话记录 → 回填事件。规格见 docs/模块设计/本机记录器.md「回填 backfill」。
// 占位：由「回填」那一路实现。
import type { CommitFinder, DirNameResolver, RecorderEvent } from "../core/types"

export interface BackfillOptions {
  /** 会话记录根目录，默认 $CLAUDE_CONFIG_DIR/projects 或 ~/.claude/projects */
  root: string
  /** 只回填这个时间之后的事件（毫秒） */
  since: number
  /** 只回填这个时间之前的事件（毫秒）；一般是「该 agent 第一个实时事件」的时间 */
  until: number
  resolveDir: DirNameResolver
  findCommits: CommitFinder
}

export interface BackfillStats {
  files: number
  sessions: number
  events: number
  skippedFiles: number
}

/** 流式读取，逐个会话产出事件；单个文件出错只跳过该文件 */
export async function* backfillClaudeCode(options: BackfillOptions, stats: BackfillStats): AsyncGenerator<RecorderEvent> {
  void options
  void stats
  throw new Error("backfillClaudeCode 还没实现")
}
