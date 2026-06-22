"use client"

import { useQuery } from "@tanstack/react-query"
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  GitBranch,
  Mail,
  Settings,
  Brain,
  ScrollText,
  Command,
  Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useMemex } from "./store"
import { ThemeToggle } from "./theme-toggle"
import type { Section, StatsData } from "./types"

const NAV: { id: Section; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "Retrieval health" },
  { id: "chat", label: "Chat", icon: MessageSquare, desc: "Citation-first Q&A" },
  { id: "notes", label: "Notes", icon: FileText, desc: "Markdown ingestion" },
  { id: "decisions", label: "Decisions", icon: Brain, desc: "Extracted rationale" },
  { id: "timeline", label: "Timeline", icon: ScrollText, desc: "Chronological view" },
  { id: "email", label: "Email", icon: Mail, desc: "Outbox & digests" },
  { id: "settings", label: "Settings", icon: Settings, desc: "Profile & SMTP" },
]

export function Sidebar() {
  const section = useMemex((s) => s.section)
  const setSection = useMemex((s) => s.setSection)
  const openEmail = useMemex((s) => s.openEmailComposer)
  const openCommandPalette = useMemex((s) => s.openCommandPalette)

  const { data: stats } = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: async () => {
      const r = await fetch("/api/stats")
      return r.json()
    },
  })

  const emailBadge = stats?.counts.emails ?? 0

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar/50 backdrop-blur-sm">
      {/* Brand */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-sm">
            <span className="text-sm tracking-tighter">M</span>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary border border-background" />
            </span>
          </div>
          <div className="leading-tight flex-1">
            <div className="font-semibold text-sm tracking-tight">Memex</div>
            <div className="text-[10px] text-muted-foreground">
              citation-first retrieval
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Search trigger */}
      <div className="p-2 border-b border-border">
        <button
          onClick={() => openCommandPalette()}
          className="w-full flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:border-border/80 transition-colors group"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-background px-1 py-0.5 text-[9px] font-mono font-medium">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto thin-scroll p-2 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = section === item.id
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "w-full group flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 mt-0.5 shrink-0",
                  active ? "text-primary" : "group-hover:text-foreground"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.id === "email" && emailBadge > 0 && (
                    <Badge variant="secondary" className="text-[9px] h-4 px-1">
                      {emailBadge}
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {item.desc}
                </div>
              </div>
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => openEmailComposer({ sourceType: "manual" })}
        >
          <Mail className="h-3.5 w-3.5 mr-1.5" />
          Compose email
        </Button>
        <div className="text-[10px] text-muted-foreground text-center px-1">
          {stats ? (
            <span>
              {stats.counts.notes} notes · {stats.corpus.chunkCount} chunks ·{" "}
              {stats.counts.decisions} decisions
            </span>
          ) : (
            <span>Loading…</span>
          )}
        </div>
      </div>
    </aside>
  )
}

// Mobile top nav (visible on small screens)
export function MobileNav() {
  const section = useMemex((s) => s.section)
  const setSection = useMemex((s) => s.setSection)
  return (
    <div className="md:hidden border-b border-border bg-background/95 backdrop-blur sticky top-0 z-30">
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto thin-scroll">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs shrink-0">
          M
        </div>
        {NAV.map((item) => {
          const Icon = item.icon
          const active = section === item.id
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shrink-0 transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
