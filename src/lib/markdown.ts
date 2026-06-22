// Minimal markdown → HTML renderer for email bodies and chat answers.
// Handles headings, bold, italic, inline code, code blocks, links,
// blockquotes, lists, and our [^chunk_id] citation markers.

export function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/)
  const html: string[] = []
  let inList = false
  let inCode = false
  let codeBuf: string[] = []

  const inline = (s: string): string => {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // code spans
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-sm">$1</code>')
      // bold
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      // italic
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      // links
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-primary underline underline-offset-2">$1</a>'
      )
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block fences
    if (/^```/.test(line)) {
      if (inCode) {
        html.push(
          `<pre class="my-2 p-3 rounded bg-muted text-sm overflow-x-auto"><code>${codeBuf
            .map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
            .join("\n")}</code></pre>`
        )
        codeBuf = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      if (inList) {
        html.push("</ul>")
        inList = false
      }
      const level = h[1].length
      const sizes = ["text-xl", "text-lg", "text-base", "text-sm"]
      html.push(
        `<h${level} class="font-semibold mt-3 mb-1 ${sizes[level - 1]}">${inline(h[2])}</h${level}>`
      )
      continue
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      if (inList) {
        html.push("</ul>")
        inList = false
      }
      html.push(
        `<blockquote class="border-l-2 border-border pl-3 italic text-muted-foreground my-2">${inline(
          line.replace(/^>\s?/, "")
        )}</blockquote>`
      )
      continue
    }

    // List items
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push('<ul class="list-disc pl-5 my-2 space-y-1">')
        inList = true
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`)
      continue
    }

    if (inList) {
      html.push("</ul>")
      inList = false
    }

    // Horizontal rule
    if (/^---+$/.test(line)) {
      html.push('<hr class="my-3 border-border" />')
      continue
    }

    if (line.trim() === "") {
      html.push("")
      continue
    }

    html.push(`<p class="my-1 leading-relaxed">${inline(line)}</p>`)
  }

  if (inList) html.push("</ul>")
  if (inCode) {
    html.push(
      `<pre class="my-2 p-3 rounded bg-muted text-sm overflow-x-auto"><code>${codeBuf
        .map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
        .join("\n")}</code></pre>`
    )
  }

  return html.join("\n")
}

// Render an answer with [^chunkId] markers as clickable citation pills.
export function renderAnswerWithCitations(
  answer: string,
  onCite: (chunkId: string) => void
): { html: string; citationIds: string[] } {
  // Pull every [^id] marker so the UI knows which citations to surface.
  const ids = new Set<string>()
  const markerRe = /\[\^([a-z0-9]+)\]/gi
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(answer)) !== null) ids.add(m[1])

  const html = answer
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[\^([a-z0-9]+)\]/gi, '<cite data-chunk="$1" class="citation-pill">$1</cite>')

  return { html, citationIds: Array.from(ids) }
}
