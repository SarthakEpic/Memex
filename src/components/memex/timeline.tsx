"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  FileText,
  Brain,
  Calendar,
  GitCommit,
  Mail,
  Loader2,
  Inbox,
} from "lucide-react"
import { useMemex } from "./store"
import type { TimelineEvent } from "./types"

export function Timeline() {
  const [project, setProject] = useState<string>("")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [showDateFilter, setShowDateFilter] = useState(false)
  const setSection = useMemex((s) => s.setSection)
  const openSource = useMemex((s) => s.openSource)

  const params = new URLSearchParams()
  if (project) params.set("project", project)

  const { data, isLoading } = useQuery<{ events: TimelineEvent[] }>({
    queryKey: ["timeline", project],
    queryFn: async () => {
      const r = await fetch(`/api/timeline?${params.toString()}`)
      return r.json()
    },
  })

  const allEvents = data?.events ?? []
  const projects = Array.from(new Set(allEvents.map((e) => e.project)))

  // Filter by date range
  const events = allEvents.filter((e) => {
    if (!dateFrom && !dateTo) return true
    const eventDate = new Date(e.timestamp).getTime()
    if (dateFrom && eventDate < new Date(dateFrom).getTime()) return false
    if (dateTo && eventDate > new Date(dateTo).getTime() + 86400000) return false // include full day
    return true
  })

  // Group by day
  const grouped = groupByDay(events)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Decision timeline
          </h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowDateFilter((s) => !s)}
              title="Filter by date range"
            >
              <Calendar className="h-3.5 w-3.5 mr-1" />
              Date
            </Button>
            {projects.length > 0 && (
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="text-xs h-8 rounded-md border border-border bg-background px-2"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {showDateFilter && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-xs h-8 rounded-md border border-border bg-background px-2"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-xs h-8 rounded-md border border-border bg-background px-2"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo("") }}
                className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
              >
                ✕ clear
              </button>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {events.length} of {allEvents.length} events
            </span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Notes and extracted decisions interleaved chronologically — trace why
          past technical choices were made.
        </p>
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1 thin-scroll">
        <div className="p-4 max-w-3xl mx-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && events.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-medium">No timeline events</p>
              <p className="text-xs text-muted-foreground">
                Ingest notes to populate the timeline.
              </p>
            </div>
          )}

          <div className="space-y-6">
            {Object.entries(grouped).map(([day, dayEvents]) => (
              <div key={day} className="space-y-2">
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-1.5 -mx-1 px-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {day}
                  </div>
                </div>
                <div className="relative timeline-rail pl-6 space-y-2.5">
                  {dayEvents.map((e) => (
                    <TimelineEventCard
                      key={`${e.type}-${e.id}`}
                      event={e}
                      onOpenSource={() => {
                        // For decisions we don't have chunkId directly; navigate to decisions
                        setSection("decisions")
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

function TimelineEventCard({
  event,
  onOpenSource,
}: {
  event: TimelineEvent
  onOpenSource: () => void
}) {
  const openEmail = useMemex((s) => s.openEmailComposer)
  const isDecision = event.type === "decision"

  return (
    <div className="relative memex-fade-up">
      {/* Dot */}
      <div
        className={`absolute -left-[22px] top-3 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background ${
          isDecision
            ? "bg-amber-500"
            : "bg-emerald-500"
        }`}
      >
        {isDecision ? (
          <Brain className="h-2 w-2 text-white" />
        ) : (
          <FileText className="h-2 w-2 text-white" />
        )}
      </div>

      <Card className={isDecision ? "border-amber-500/30" : ""}>
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge
                  variant={isDecision ? "default" : "secondary"}
                  className="text-[9px] h-4"
                >
                  {isDecision ? (
                    <>
                      <Brain className="h-2.5 w-2.5 mr-0.5" />
                      decision
                    </>
                  ) : (
                    <>
                      <FileText className="h-2.5 w-2.5 mr-0.5" />
                      note
                    </>
                  )}
                </Badge>
                <Badge variant="outline" className="text-[9px] h-4">
                  {event.project}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(event.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <h3 className="text-sm font-medium leading-tight">{event.title}</h3>

              {isDecision && event.rationale && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                  {event.rationale}
                </p>
              )}
              {!isDecision && (
                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                  <span className="font-mono truncate">{event.sourcePath}</span>
                  {event.chunkCount !== undefined && (
                    <span>· {event.chunkCount} chunks</span>
                  )}
                </div>
              )}
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] shrink-0"
              onClick={() =>
                openEmail({
                  subject: isDecision
                    ? `Decision: ${event.title}`
                    : `Note: ${event.title}`,
                  bodyMarkdown: isDecision
                    ? `# ${event.title}\n\n**Project:** ${event.project}\n**Decided:** ${event.decisionDate || "—"}\n\n## Rationale\n${event.rationale}\n\n_Source: ${event.sourcePath}_\n\n---\n_Sent from Memex · citation-first knowledge retrieval_\n`
                    : `# ${event.title}\n\n_Source: ${event.sourcePath} · ${event.project}_\n\n---\n\nSee full note in Memex.\n\n---\n_Sent from Memex · citation-first knowledge retrieval_\n`,
                  sourceType: isDecision ? "decision" : "note",
                  sourceId: event.id,
                })
              }
            >
              <Mail className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function groupByDay(events: TimelineEvent[]): Record<string, TimelineEvent[]> {
  const out: Record<string, TimelineEvent[]> = {}
  for (const e of events) {
    const day = new Date(e.timestamp).toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    if (!out[day]) out[day] = []
    out[day].push(e)
  }
  return out
}
