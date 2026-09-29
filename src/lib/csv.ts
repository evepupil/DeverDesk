/** 生成并下载 CSV：带 BOM，Excel 打开中文不乱码；含逗号、引号、换行的单元格加引号 */

function cell(value: string | number): string {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return `﻿${[header, ...rows].map((row) => row.map(cell).join(",")).join("\n")}`
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
