"use client"

import { useMemex } from "./store"
import { memo } from "react"

// Renders a chat answer that may contain [^chunkId] citation markers.
// Markers become clickable pills that open the source panel.
export const AnswerRenderer = memo(function AnswerRenderer({
  answer,
}: {
  answer: string
}) {
  const openSource = useMemex((s) => s.openSource)
  const blocks = parseBlocks(answer)

  return (
    <div className="text-sm leading-relaxed space-y-2">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} onCite={openSource} />
      ))}
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Block + inline parsing
// ─────────────────────────────────────────────────────────────────────────────

type Inline =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "cite"; chunkId: string }

type Block =
  | { kind: "heading"; level: number; inline: Inline[] }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "blockquote"; inline: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "code"; lang: string; value: string }
  | { kind: "hr" }

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Code fence
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // skip closing fence
      blocks.push({ kind: "code", lang, value: buf.join("\n") })
      continue
    }

    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length, inline: parseInline(h[2]) })
      i++
      continue
    }

    // Hr
    if (/^---+$/.test(line.trim())) {
      blocks.push({ kind: "hr" })
      i++
      continue
    }

    // Blockquote (consecutive > lines)
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""))
        i++
      }
      blocks.push({ kind: "blockquote", inline: parseInline(buf.join(" ")) })
      continue
    }

    // List (consecutive - or * lines)
    if (/^[-*]\s+/.test(line)) {
      const items: Inline[][] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^[-*]\s+/, "")))
        i++
      }
      blocks.push({ kind: "list", items })
      continue
    }

    // Blank line
    if (line.trim() === "") {
      i++
      continue
    }

    // Paragraph: collect until blank line or block starter
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4}\s|>\s?|[-*]\s+|```|---+$)/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ kind: "paragraph", inline: parseInline(buf.join(" ")) })
  }
  return blocks
}

function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const re =
    /(\[\^[a-z0-9]+\]|\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)]+\))/gi
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith("[^")) {
      out.push({ kind: "cite", chunkId: tok.slice(2, -1) })
    } else if (tok.startsWith("**")) {
      out.push({ kind: "bold", value: tok.slice(2, -2) })
    } else if (tok.startsWith("`")) {
      out.push({ kind: "code", value: tok.slice(1, -1) })
    } else if (tok.startsWith("*")) {
      out.push({ kind: "italic", value: tok.slice(1, -1) })
    } else if (tok.startsWith("_")) {
      out.push({ kind: "italic", value: tok.slice(1, -1) })
    } else if (tok.startsWith("[")) {
      const lm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)
      if (lm) out.push({ kind: "link", text: lm[1], href: lm[2] })
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) })
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Block rendering
// ─────────────────────────────────────────────────────────────────────────────

function BlockView({ block, onCite }: { block: Block; onCite: (id: string) => void }) {
  switch (block.kind) {
    case "heading": {
      const sizes = [
        "text-base font-semibold mt-3 mb-1",
        "text-sm font-semibold mt-2 mb-1",
        "text-sm font-medium mt-2 mb-0.5",
        "text-xs font-medium mt-1",
      ]
      return <div className={sizes[block.level - 1]}>{inlineView(block.inline, onCite)}</div>
    }
    case "paragraph":
      return <p className="whitespace-pre-wrap">{inlineView(block.inline, onCite)}</p>
    case "blockquote":
      return (
        <blockquote className="border-l-2 border-muted-foreground/40 pl-3 italic text-muted-foreground">
          {inlineView(block.inline, onCite)}
        </blockquote>
      )
    case "list":
      return (
        <ul className="list-disc pl-5 space-y-1">
          {block.items.map((it, i) => (
            <li key={i}>{inlineView(it, onCite)}</li>
          ))}
        </ul>
      )
    case "code":
      return (
        <pre className="my-2 p-3 rounded bg-muted text-xs overflow-x-auto">
          <code>{block.value}</code>
        </pre>
      )
    case "hr":
      return <hr className="border-border my-2" />
  }
}

function inlineView(inline: Inline[], onCite: (id: string) => void): React.ReactNode {
  return inline.map((n, i) => {
    switch (n.kind) {
      case "text":
        return <span key={i}>{n.value}</span>
      case "bold":
        return <strong key={i}>{n.value}</strong>
      case "italic":
        return <em key={i}>{n.value}</em>
      case "code":
        return (
          <code key={i} className="px-1 py-0.5 rounded bg-muted text-[0.85em]">
            {n.value}
          </code>
        )
      case "link":
        return (
          <a
            key={i}
            href={n.href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {n.text}
          </a>
        )
      case "cite":
        return (
          <button
            key={i}
            onClick={() => onCite(n.chunkId)}
            title={`View source chunk ${n.chunkId}`}
            className="citation-pill mx-0.5 align-baseline"
          >
            {n.chunkId.slice(-4)}
          </button>
        )
    }
  })
}
