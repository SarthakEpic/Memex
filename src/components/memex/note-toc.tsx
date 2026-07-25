"use client"

import { useMemo } from "react"
import { ListOrdered, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface TocItem {
  id: string
  level: number // 1, 2, 3, 4
  text: string
}

interface NoteTocProps {
  content: string
  className?: string
}

// Auto-generates a table of contents from markdown headings (## and ###).
// Renders as a sticky sidebar with clickable links that scroll to the heading.
export function NoteToc({ content, className }: NoteTocProps) {
  const items = useMemo<TocItem[]>(() => {
    const lines = content.split("\n")
    const toc: TocItem[] = []
    let inCodeBlock = false
    for (const line of lines) {
      if (/^```/.test(line)) {
        inCodeBlock = !inCodeBlock
        continue
      }
      if (inCodeBlock) continue
      const match = line.match(/^(#{1,4})\s+(.+)$/)
      if (match) {
        const level = match[1].length
        const text = match[2].replace(/[*_`~]/g, "").trim()
        // Generate a slug for the heading
        const slug = text
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 60)
        toc.push({ id: slug, level, text })
      }
    }
    return toc
  }, [content])

  if (items.length < 2) return null

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
        <ListOrdered className="h-3 w-3" />
        Contents
      </div>
      <nav className="space-y-0.5">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => {
              // Find the heading in the rendered content and scroll to it
              const els = document.querySelectorAll(
                `.prose-memex h${item.level}`
              )
              const target = Array.from(els).find(
                (el) => el.textContent?.trim() === item.text
              )
              if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" })
                target.classList.add("toc-highlight")
                setTimeout(() => target.classList.remove("toc-highlight"), 2000)
              }
            }}
            className={cn(
              "flex items-start gap-1 text-left text-xs transition-colors w-full rounded-sm hover:bg-accent px-1.5 py-0.5",
              item.level === 1 && "font-semibold text-foreground",
              item.level === 2 && "text-muted-foreground hover:text-foreground",
              item.level === 3 && "text-muted-foreground/80 hover:text-foreground ml-3",
              item.level === 4 && "text-muted-foreground/60 hover:text-foreground ml-6"
            )}
            title={`Scroll to: ${item.text}`}
          >
            {item.level > 1 && <ChevronRight className="h-2.5 w-2.5 shrink-0 mt-0.5 opacity-50" />}
            <span className="truncate">{item.text}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
