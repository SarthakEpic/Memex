"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Keyboard } from "lucide-react"

interface Shortcut {
  keys: string[]
  description: string
  category: string
}

const SHORTCUTS: Shortcut[] = [
  // Global
  { keys: ["⌘", "K"], description: "Open command palette", category: "Global" },
  { keys: ["?"], description: "Show this shortcuts help", category: "Global" },
  { keys: ["Esc"], description: "Close dialog / panel", category: "Global" },
  // Navigation (via command palette)
  { keys: ["⌘", "K"], description: "→ then type section name to navigate", category: "Navigation" },
  // Chat
  { keys: ["Enter"], description: "Send chat message", category: "Chat" },
  { keys: ["⇧", "Enter"], description: "New line in chat input", category: "Chat" },
  // Theme
  { keys: ["⌘", "K"], description: "→ then 'light' or 'dark' to switch theme", category: "Theme" },
]

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only trigger on "?" when not typing in an input/textarea
      if (e.key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const categories = Array.from(new Set(SHORTCUTS.map((s) => s.category)))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Speed up your workflow with these shortcuts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {categories.map((cat) => (
            <div key={cat} className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                {cat}
              </div>
              <div className="space-y-1">
                {SHORTCUTS.filter((s) => s.category === cat).map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <span className="text-foreground/80">{s.description}</span>
                    <div className="flex items-center gap-0.5">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border border-border bg-muted text-[10px] font-mono font-medium"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false
  const tag = target.tagName.toLowerCase()
  return tag === "input" || tag === "textarea" || target.isContentEditable
}
