// 计时与到站的常量。含义见 docs/模块设计/编程自动记录.md「精确规则」。
const MINUTE = 60_000

/** 相邻两次动静间隔小于它，中间都算你在场 */
export const PRESENCE_GAP = 15 * MINUTE
/** 你发话后 AI 自己干活，最多只算前 15 分钟 */
export const AI_ALONE_CAP = 15 * MINUTE
/** 一个窗口这么久没动静，攒下的工作收成一个任务 */
export const IDLE_ARRIVAL = 2 * 60 * MINUTE
/** 相隔不到它的提交算「一口气连着提交」 */
export const BURST_GAP = 2 * MINUTE
/** 比它短的零碎提交，并进上一个任务 */
export const MICRO_TASK = 3 * MINUTE
/** 并进上一个任务的前提：上一个任务在这之内到站 */
export const MERGE_WINDOW = 2 * 60 * MINUTE
/** 比它短的时间段不记 */
export const MIN_ENTRY = 0.5 * MINUTE
/** 没有对应 AI 工作时间的单个提交，至少要有这么长才新建任务 */
export const MIN_STANDALONE_TASK = 1 * MINUTE
/** 只算到「现在 − 它」，避开刚写进日志还没落稳的事件 */
export const SETTLE_LAG = 30_000

/** 任务名最长（和服务器一致） */
export const TASK_TITLE_MAX = 80
/** 没有提交时用你的第一句话做任务名，最长 */
export const FALLBACK_TITLE_MAX = 40
