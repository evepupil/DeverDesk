import { FALLBACK_TITLE_MAX, TASK_TITLE_MAX } from "./constants"
import type { CommitEvent, PromptEvent, RecorderEvent } from "./types"

const COMMIT_PREFIX = /^\s*(?:feat|fix|docs|refactor|test|chore|perf|style|build|ci|revert)(?:\([^()\r\n]*\))?!?\s*[:：]\s*/i
const TASK_REFERENCE = /\bT-(\d{1,6})\b/i
const TASK_REFERENCE_LINE = /^\s*(?:Closes|Fixes|Refs|Task|Done|完成了?|关闭了?)(?:(?:\s*[:：]\s*)|\s+|(?=T-))/i

function truncate(value: string, max: number): string {
  const chars = [...value]
  return chars.length > max ? `${chars.slice(0, Math.max(0, max - 1)).join("")}…` : value
}

export function cleanCommitSubject(subject: string): string {
  const stripped = subject.replace(COMMIT_PREFIX, "").trim()
  return truncate(stripped || subject, TASK_TITLE_MAX)
}

export function taskSeqFromCommit(commit: Pick<CommitEvent, "subject" | "body">): number | undefined {
  const subjectFirstLine = commit.subject.split(/\r?\n/, 1)[0] ?? ""
  const firstLineRef = subjectFirstLine.match(TASK_REFERENCE)
  if (firstLineRef?.[1]) return Number(firstLineRef[1])

  const bodyLines = (commit.body ?? "").split(/\r?\n/)
  for (const line of bodyLines) {
    const prefix = line.match(TASK_REFERENCE_LINE)
    if (!prefix) continue
    const match = line.slice(prefix[0].length).match(TASK_REFERENCE)
    if (match?.[1]) return Number(match[1])
  }
  return undefined
}

function firstSentence(text: string): string {
  return text.split(/[。！？!?\r\n]+|\.(?=\s|$)/).map(sentence => sentence.trim()).find(Boolean) ?? ""
}

export function fallbackTitle(
  events: readonly RecorderEvent[],
  start: number,
  end: number,
  clock: (ms: number) => string = utcTime,
  range: { start: number; end: number } = { start, end },
): string {
  const prompts = events.filter((event): event is PromptEvent => event.kind === "prompt"
    && event.t >= start && event.t <= end)
  for (const prompt of prompts) {
    if (!prompt.text?.trim()) continue
    const sentence = firstSentence(prompt.text)
    if (sentence) return truncate(sentence, FALLBACK_TITLE_MAX)
  }
  return `Coding ${clock(range.start)}–${clock(range.end)}`
}

function utcTime(t: number): string {
  const date = new Date(t)
  if (Number.isNaN(date.getTime())) return "00:00"
  return date.toISOString().slice(11, 16)
}
