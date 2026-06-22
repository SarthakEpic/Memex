"use client"

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Brain,
  Search,
  Mail,
  Calendar,
  Users,
  GitCompare,
  FileText,
  Quote,
  Loader2,
} from "lucide-react"
import { useMemex } from "./store"
import type { DecisionSummary } from "./types"

export function Decisions() {
  const [search, setSearch] = useState("")
  const [project, setProject] = useState<string>("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Listen for "open decision" events from related-decision clicks
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string
      setSelectedId(detail)
    }
    window.addEventListener("memex-open-decision", handler)
    return () => window.removeEventListener("memex-open-decision", handler)
  }, [])

  const params = new URLSearchParams()
  if (search) params.set("q", search)
  if (project) params.set("project", project)

  const { data, isLoading } = useQuery<{ decisions: DecisionSummary[] }>({
    queryKey: ["decisions", search, project],
    queryFn: async () => {
      const r = await fetch(`/api/decisions?${params.toString()}`)
      return r.json()
    },
  })

  const decisions = data?.decisions ?? []
  const projects = Array.from(new Set(decisions.map((d) => d.project)))

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-border p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4 text-amber-500" />
            Decisions ({decisions.length})
          </h2>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search "why did I pick…"'
              className="text-xs pl-8 h-8"
            />
          </div>
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

      {/* List */}
      <ScrollArea className="flex-1 thin-scroll">
        <div className="p-3 space-y-2 max-w-4xl mx-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && decisions.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <Brain className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-medium">No decisions found</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {search
                  ? "Try a different search term."
                  : "Ingest notes with decision-like content and the LLM will extract decisions automatically."}
              </p>
            </div>
          )}
          {decisions.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              onClick={() => setSelectedId(d.id)}
            />
          ))}
        </div>
      </ScrollArea>

      <DecisionDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}

function DecisionCard({
  decision,
  onClick,
}: {
  decision: DecisionSummary
  onClick: () => void
}) {
  const confPct = Math.round(decision.confidence * 100)
  return (
    <Card
      className="cursor-pointer hover:border-amber-500/40 transition-colors memex-fade-up"
      onClick={onClick}
    >
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="secondary" className="text-[9px] h-4">
                {decision.project}
              </Badge>
              {decision.decisionDate && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Calendar className="h-2.5 w-2.5" />
                  {decision.decisionDate}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold leading-tight">{decision.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
              {decision.rationale}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] text-muted-foreground">confidence</div>
            <div className="text-sm font-semibold tabular-nums">{confPct}%</div>
            <div className="w-12 mt-1">
              <Progress value={confPct} className="h-1" />
            </div>
          </div>
        </div>

        {(decision.alternatives.length > 0 || decision.participants.length > 0) && (
          <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-border/60 text-[10px] text-muted-foreground">
            {decision.alternatives.length > 0 && (
              <span className="flex items-center gap-1">
                <GitCompare className="h-2.5 w-2.5" />
                {decision.alternatives.join(", ")}
              </span>
            )}
            {decision.participants.length > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-2.5 w-2.5" />
                {decision.participants.join(", ")}
              </span>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <FileText className="h-2.5 w-2.5" />
          <span className="truncate font-mono">{decision.note.sourcePath}</span>
          <span>· chunk #{decision.chunk.chunkIndex}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function DecisionDetailDialog({
  id,
  onClose,
}: {
  id: string | null
  onClose: () => void
}) {
  const openEmail = useMemex((s) => s.openEmailComposer)
  const openSource = useMemex((s) => s.openSource)
  const { data, isLoading } = useQuery<{
    decision: {
      id: string
      title: string
      decisionDate: string
      rationale: string
      alternatives: string[]
      outcome: string
      participants: string[]
      project: string
      confidence: number
      createdAt: string
      note: { id: string; title: string; sourcePath: string; project: string }
      chunk: { id: string; text: string; headingPath: string; chunkIndex: number }
    }
  }>({
    queryKey: ["decision", id],
    queryFn: async () => {
      const r = await fetch(`/api/decisions/${id}`)
      return r.json()
    },
    enabled: !!id,
  })

  // Related decisions by term overlap
  const { data: relatedData } = useQuery<{
    related: {
      id: string
      title: string
      rationale: string
      decisionDate: string
      project: string
      confidence: number
      score: number
      sharedTerms: number
      note: { id: string; title: string; sourcePath: string }
    }[]
  }>({
    queryKey: ["decision-related", id],
    queryFn: async () => {
      const r = await fetch(`/api/decisions/${id}/related?limit=4`)
      return r.json()
    },
    enabled: !!id,
  })

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-amber-500" />
            Decision detail
          </DialogTitle>
          <DialogDescription className="sr-only">
            Full extracted decision with source chunk and rationale.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {data?.decision && (
          <ScrollArea className="flex-1 thin-scroll">
            <div className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {data.decision.project}
                    </Badge>
                    {data.decision.decisionDate && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {data.decision.decisionDate}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold leading-tight">
                    {data.decision.title}
                  </h2>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-muted-foreground">confidence</div>
                  <div className="text-lg font-semibold">
                    {Math.round(data.decision.confidence * 100)}%
                  </div>
                </div>
              </div>

              <Separator />

              <Field label="Rationale" icon={Quote}>
                <p className="text-sm leading-relaxed">{data.decision.rationale}</p>
              </Field>

              {data.decision.alternatives.length > 0 && (
                <Field label="Alternatives considered" icon={GitCompare}>
                  <div className="flex flex-wrap gap-1.5">
                    {data.decision.alternatives.map((a) => (
                      <Badge key={a} variant="outline" className="text-xs">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </Field>
              )}

              {data.decision.outcome && (
                <Field label="Outcome">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {data.decision.outcome}
                  </p>
                </Field>
              )}

              {data.decision.participants.length > 0 && (
                <Field label="Participants" icon={Users}>
                  <div className="flex flex-wrap gap-1.5">
                    {data.decision.participants.map((p) => (
                      <Badge key={p} variant="secondary" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </Field>
              )}

              <Separator />

              <Field label="Source chunk" icon={FileText}>
                <button
                  onClick={() => openSource(data.decision.chunk.id)}
                  className="w-full text-left rounded-md border border-border p-3 hover:border-primary/50 hover:bg-accent/50 transition-colors"
                >
                  <div className="text-[10px] text-muted-foreground font-mono mb-1.5">
                    {data.decision.note.sourcePath}
                    {data.decision.chunk.headingPath &&
                      ` › ${data.decision.chunk.headingPath}`}
                    {" · #"}{data.decision.chunk.chunkIndex}
                  </div>
                  <p className="text-xs font-mono leading-relaxed line-clamp-6">
                    {data.decision.chunk.text}
                  </p>
                </button>
              </Field>

              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => openEmail({
                    subject: `Decision: ${data.decision.title}`,
                    bodyMarkdown: `# ${data.decision.title}\n\n**Project:** ${data.decision.project}\n**Decided:** ${data.decision.decisionDate || "—"}\n**Confidence:** ${Math.round(data.decision.confidence * 100)}%\n\n## Rationale\n${data.decision.rationale}\n\n## Alternatives\n${data.decision.alternatives.map((a) => `- ${a}`).join("\n")}\n\n## Source\n${data.decision.note.sourcePath} › ${data.decision.chunk.headingPath}\n\n---\n_Sent from Memex · citation-first knowledge retrieval_\n`,
                    sourceType: "decision",
                    sourceId: data.decision.id,
                  })}
                >
                  <Mail className="h-3.5 w-3.5 mr-1.5" />
                  Email this decision
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => openSource(data.decision.chunk.id)}
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  View source
                </Button>
              </div>

              {/* Related decisions */}
              {relatedData && relatedData.related.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
                    <GitCompare className="h-3 w-3" />
                    Related decisions ({relatedData.related.length})
                  </div>
                  <div className="space-y-1.5">
                    {relatedData.related.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          onClose()
                          // Small delay to let dialog close, then open the related one
                          setTimeout(() => {
                            window.dispatchEvent(
                              new CustomEvent("memex-open-decision", { detail: r.id })
                            )
                          }, 100)
                        }}
                        className="w-full text-left rounded-md border border-border p-2.5 hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium leading-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                              {r.title}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {r.note.sourcePath}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[9px] text-muted-foreground">
                              {Math.round(r.score * 100)}% match
                            </div>
                            <div className="text-[9px] text-muted-foreground">
                              {r.sharedTerms} terms
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      {children}
    </div>
  )
}
