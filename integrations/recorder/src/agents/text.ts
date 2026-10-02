const SENTENCE_END = new Set(["。", "！", "？", ".", "!", "?"])

/** 返回第一句非空、非斜杠命令文本；按 Unicode 字符计长，不补省略号。 */
export function firstSentence(text: unknown, max: number): string | undefined {
  if (typeof text !== "string" || max <= 0) return undefined
  let start = 0
  const candidates: string[] = []
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === "\n" || character === "\r" || (character !== undefined && SENTENCE_END.has(character))) {
      const end = character === "\n" || character === "\r" ? index : index + 1
      candidates.push(text.slice(start, end))
      if (character === "\r" && text[index + 1] === "\n") index += 1
      start = index + 1
    }
  }
  if (start < text.length) candidates.push(text.slice(start))

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (!trimmed || trimmed.startsWith("/")) continue
    return Array.from(trimmed).slice(0, Math.floor(max)).join("")
  }
  return undefined
}
