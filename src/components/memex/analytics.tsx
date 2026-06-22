"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  BarChart3,
  TrendingUp,
  MessageSquare,
  Quote,
  Calendar,
  FolderKanban,
  FileText,
  Loader2,
  Hash,
} from "lucide-react"
import { useMemex } from "./store"
import type { AnalyticsData } from "./types"

export function Analytics() {
  const setSection = useMemex((s) => s.setSection)
  const openSource = useMemex((s) => s.openSource)
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["analytics"],
    queryFn: async () => {
      const r = await fetch("/api/analytics")
      return r.json()
    },
  })

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-7 w-48 rounded bg-muted animate-pulse" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const s = data.summary
  const maxActivity = Math.max(...data.questionActivity.map((d) => d.count), 1)
  const maxCited = Math.max(...data.mostCitedChunks.map((c) => c.count), 1)

  return (
    <div className="p-4 sm:p-6 space-y-6 memex-fade-up max-w-5xl">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Insights from your chat activity — which source chunks get cited most,
          what questions you ask, and how your knowledge base is distributed.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <SummaryStat icon={MessageSquare} label="Questions" value={s.totalQuestions} accent="text-primary" />
        <SummaryStat icon={MessageSquare} label="Answers" value={s.totalAnswers} accent="text-emerald-600 dark:text-emerald-400" />
        <SummaryStat icon={Quote} label="Citations" value={s.totalCitations} accent="text-amber-600 dark:text-amber-400" />
        <SummaryStat icon={TrendingUp} label="Avg / answer" value={s.avgCitationsPerAnswer} accent="text-teal-600 dark:text-teal-400" />
        <SummaryStat icon={Hash} label="Unique chunks" value={s.uniqueCitedChunks} accent="text-rose-600 dark:text-rose-400" />
      </div>

      {/* Most-cited chunks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Quote className="h-4 w-4 text-primary" />
            Most-cited chunks
          </CardTitle>
          <CardDescription>
            Which source chunks the LLM references most often in its answers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.mostCitedChunks.length === 0 && (
            <div className="text-center py-6">
              <Quote className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No citations yet. Ask questions in chat to see which chunks get cited.
              </p>
            </div>
          )}
          {data.mostCitedChunks.map((c, i) => (
            <button
              key={c.chunkId}
              onClick={() => openSource(c.chunkId)}
              className="w-full text-left rounded-md border border-border p-2.5 hover:border-primary/40 hover:bg-accent/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-mono text-muted-foreground truncate">
                    {c.sourcePath}
                    <span className="text-foreground/60"> · #{c.chunkIndex}</span>
                  </div>
                  {c.headingPath && (
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {c.headingPath}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <div className="w-20">
                    <Progress value={(c.count / maxCited) * 100} className="h-1.5" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {c.count}×
                  </Badge>
                </div>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Question activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Question activity (14 days)
            </CardTitle>
            <CardDescription>Questions asked per day.</CardDescription>
          </CardHeader>
          <CardContent>
            {s.totalQuestions === 0 ? (
              <div className="text-center py-6">
                <Calendar className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No questions yet.</p>
              </div>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {data.questionActivity.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 group relative flex flex-col items-center justify-end"
                  >
                    <div
                      className="w-full rounded-t bg-primary/70 group-hover:bg-primary transition-colors min-h-[2px]"
                      style={{ height: `${(d.count / maxActivity) * 100}%` }}
                      title={`${d.date}: ${d.count} question${d.count !== 1 ? "s" : ""}`}
                    />
                    {d.count > 0 && (
                      <span className="absolute -top-4 text-[9px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.count}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between text-[9px] text-muted-foreground mt-2">
              <span>{data.questionActivity[0]?.date.slice(5)}</span>
              <span>{data.questionActivity[data.questionActivity.length - 1]?.date.slice(5)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Project distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-primary" />
              Projects
            </CardTitle>
            <CardDescription>
              Note + decision count per project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.projectStats.length === 0 && (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            )}
            {data.projectStats.map((p) => {
              const maxNotes = Math.max(...data.projectStats.map((x) => x.notes), 1)
              return (
                <div key={p.project} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-medium">{p.project}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {p.notes} notes · {p.decisions} decisions
                    </span>
                  </div>
                  <Progress value={(p.notes / maxNotes) * 100} className="h-1.5" />
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Recent questions */}
      {data.recentQuestions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Recent questions
            </CardTitle>
            <CardDescription>The last 10 questions you asked.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.recentQuestions.map((q, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 py-1.5 border-b border-border/40 last:border-0"
              >
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground mt-1" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{q.question}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(q.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* CTA */}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 flex items-start gap-3">
        <BarChart3 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Analytics update in real time</p>
          <p className="text-muted-foreground">
            These metrics refresh every time you ask a question. Open{" "}
            <button className="text-primary underline underline-offset-2" onClick={() => setSection("chat")}>
              Chat
            </button>{" "}
            to generate more data.
          </p>
        </div>
      </div>
    </div>
  )
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  accent: string
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${accent}`} />
          <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
        </div>
        <div className="mt-1.5 text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}
