const CRITICAL_PATTERN = /\b(?:urgent|asap|deadline|due|before|after|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|today|tomorrow|amount|invoice|payment|security|password|verify|approve|reply|respond|confirm|meeting|interview|legal|contract|attachment)\b/i
const STOP_WORDS = new Set(["the", "and", "for", "that", "this", "with", "from", "your", "email", "mail", "reply", "please", "about"])

export type RelevantTextSelection = {
  text: string
  originalChars: number
  selectedChars: number
  omitted: boolean
  selectedSegments: number
}

export function selectRelevantText(source: string, query: string, maxChars = 4_800): RelevantTextSelection {
  const normalized = source.replace(/\r\n/g, "\n").trim()
  if (normalized.length <= maxChars) {
    return { text: normalized, originalChars: normalized.length, selectedChars: normalized.length, omitted: false, selectedSegments: normalized ? 1 : 0 }
  }

  const terms = query.toLowerCase().match(/[a-z0-9@.]{3,}/g)?.filter((term) => !STOP_WORDS.has(term)) ?? []
  const windowChars = Math.max(160, Math.min(900, Math.floor((maxChars - 60) / 2)))
  const rawSegments = normalized.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/).map((text) => text.trim()).filter(Boolean)
  const segments = rawSegments.flatMap((segment) => {
    if (segment.length <= windowChars) return [segment]
    const windows: string[] = []
    for (let offset = 0; offset < segment.length; offset += windowChars) {
      windows.push(segment.slice(offset, offset + windowChars))
    }
    return windows
  }).map((text, index, all) => ({ text, index, total: all.length }))
  const scored = segments.map((segment) => {
    const lower = segment.text.toLowerCase()
    const termScore = terms.reduce((score, term) => score + (lower.includes(term) ? 12 : 0), 0)
    const boundaryScore = segment.index === 0 || segment.index === segment.total - 1 ? 10 : 0
    const criticalScore = CRITICAL_PATTERN.test(segment.text) ? 18 : 0
    const dateScore = /\b(?:\d{1,2}[:/]\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}|\$\d|₹\d)\b/.test(segment.text) ? 10 : 0
    return { ...segment, score: termScore + boundaryScore + criticalScore + dateScore }
  })

  const chosen = new Map<number, string>()
  let used = 0
  for (const segment of scored.sort((a, b) => b.score - a.score || a.index - b.index)) {
    // Reserve separator/omission-marker space for every selected window so a
    // final .slice() cannot silently cut the high-value closing window.
    const room = maxChars - used - 64
    if (room <= 80) break
    const value = segment.text.slice(0, room)
    chosen.set(segment.index, value)
    used += value.length + 64
  }

  const ordered = [...chosen.entries()].sort((a, b) => a[0] - b[0])
  const text = ordered.map(([index, value], position) => {
    const previous = position > 0 ? ordered[position - 1][0] : -1
    return previous >= 0 && index > previous + 1 ? `[... middle of original email omitted ...]\n\n${value}` : value
  }).join("\n\n").slice(0, maxChars)

  return { text, originalChars: normalized.length, selectedChars: text.length, omitted: true, selectedSegments: ordered.length }
}
