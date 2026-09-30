"use client"

// 改自 Aceternity UI 的 Code Block 组件。
import { useEffect, useRef, useState } from "react"
import { IconCheck, IconCopy } from "@tabler/icons-react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { cn } from "@/lib/cn"

type CodeTab = {
  label: string
  language: string
  code: string
}

type CodeBlockProps = {
  code: string
  language: string
  filename: string
  highlightLines?: number[]
  copyLabel: string
  copiedLabel: string
  className?: string
  showLineNumbers?: boolean
  tabs?: CodeTab[]
}

export function CodeBlock({
  code,
  language,
  filename,
  highlightLines = [],
  copyLabel,
  copiedLabel,
  className,
  showLineNumbers = true,
  tabs,
}: CodeBlockProps) {
  const [activeTab, setActiveTab] = useState(0)
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasTabs = Boolean(tabs?.length)
  const activeCode = hasTabs ? tabs?.[activeTab]?.code ?? "" : code
  const activeLanguage = hasTabs ? tabs?.[activeTab]?.language ?? language : language

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  const copyToClipboard = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(activeCode)
      setCopied(true)
      if (resetTimer.current) clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      return
    }
  }

  return (
    <div className={cn("relative w-full rounded-xl bg-slate-900 p-4 font-mono text-sm", className)}>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
        {hasTabs ? (
          <div role="tablist" aria-label={filename} className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {tabs?.map((tab, index) => (
              <button
                key={`${tab.label}-${index}`}
                type="button"
                role="tab"
                aria-selected={activeTab === index}
                className={cn(
                  "h-9 shrink-0 rounded-sm px-3 text-sm transition-colors",
                  activeTab === index ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200",
                )}
                onClick={() => setActiveTab(index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="truncate text-xs text-zinc-300">{filename}</span>
        )}
        <button
          type="button"
          onClick={copyToClipboard}
          data-copy-button
          aria-label={copied ? copiedLabel : copyLabel}
          title={copied ? copiedLabel : copyLabel}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <IconCheck size={16} stroke={1.75} aria-hidden /> : <IconCopy size={16} stroke={1.75} aria-hidden />}
        </button>
      </div>
      <div className="overflow-x-auto no-scrollbar">
        <SyntaxHighlighter
          language={activeLanguage}
          style={atomDark}
          showLineNumbers={showLineNumbers}
          wrapLines
          lineProps={(lineNumber) => ({
            style: {
              display: "block",
              backgroundColor: highlightLines.includes(lineNumber) ? "rgba(30,144,255,0.12)" : "transparent",
              borderLeft: highlightLines.includes(lineNumber) ? "2px solid rgba(30,144,255,0.7)" : "2px solid transparent",
              marginLeft: -16,
              paddingLeft: 14,
              paddingRight: 16,
              minWidth: "calc(100% + 32px)",
            },
          })}
          customStyle={{
            background: "transparent",
            margin: 0,
            padding: 0,
            fontSize: "0.875rem",
            lineHeight: "1.5rem",
            fontFamily: "var(--font-mono)",
          }}
          codeTagProps={{ style: { fontFamily: "inherit" } }}
          lineNumberStyle={{ color: "var(--color-zinc-500)", minWidth: "2.5em", paddingRight: "1em", userSelect: "none" }}
        >
          {activeCode}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

export default CodeBlock
