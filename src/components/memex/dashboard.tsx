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
  FileText,
  Brain,
  MessageSquare,
  Mail,
  Database,
  Hash,
  CheckCircle2,
  ShieldAlert,
  TrendingUp,
  Layers,
} from "lucide-react"
import { useMemex } from "./store"
import type { StatsData } from "./types"

export function Dashboard() {
  const setSection = useMemex((s) => s.setSection)
  const { data: stats, isLoading } = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: async () => {
      const r = await fetch("/api/stats")
      return r.json()
    },
  })

  if (isLoading || !stats) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-7 w-48 rounded bg-muted animate-pulse" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const counts = stats.counts
  const healthScore = Math.round(
    (stats.citationCoverage * 0.5 + (100 - stats.refusalRate) * 0.3 + Math.min(100, counts.emails * 10) * 0.2)
  )

  return (
    <div className="p-4 sm:p-6 space-y-6 memex-fade-up">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-5 sm:p-6">
        <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-primary/10 blur-3xl -mr-12 -mt-12" />
        <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl -ml-8 -mb-8" />
        <div className="relative space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] gap-1 bg-background/50 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              Health score: <span className="font-semibold text-foreground">{healthScore}/100</span>
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            Retrieval health
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Live snapshot of your knowledge corpus, citation coverage, and email
            delivery. Every claim cites a source chunk — or honestly says it can&apos;t.
          </p>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Notes"
          value={counts.notes}
          sub={`${stats.notesByProject.length} projects`}
          accent="emerald"
          onClick={() => setSection("notes")}
        />
        <StatCard
          icon={Layers}
          label="Chunks"
          value={stats.corpus.chunkCount}
          sub={`avg ${stats.corpus.avgTokensPerChunk} tok/chunk`}
          accent="teal"
        />
        <StatCard
          icon={Brain}
          label="Decisions"
          value={counts.decisions}
          sub="LLM-extracted"
          accent="amber"
          onClick={() => setSection("decisions")}
        />
        <StatCard
          icon={Mail}
          label="Emails sent"
          value={counts.emails}
          sub={`${counts.emailsDelivered} delivered`}
          accent="rose"
          onClick={() => setSection("email")}
        />
      </div>

      {/* Citation integrity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Citation integrity
          </CardTitle>
          <CardDescription>
            The differentiator: every claim links to its source chunk, or the model
            admits it can&apos;t cite one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Citation coverage</span>
              <span className="font-medium">{stats.citationCoverage}%</span>
            </div>
            <Progress value={stats.citationCoverage} className="h-2" />
            <p className="text-[11px] text-muted-foreground">
              Percentage of assistant answers that include at least one verifiable
              source citation.
            </p>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Honest refusal rate</span>
              <span className="font-medium">{stats.refusalRate}%</span>
            </div>
            <Progress value={stats.refusalRate} className="h-2" />
            <p className="text-[11px] text-muted-foreground">
              Percentage of answers where the model said &quot;I don&apos;t have a source
              for this.&quot; A non-zero rate is healthy — it means the citation
              enforcement is working.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Corpus + distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Corpus index
            </CardTitle>
            <CardDescription>BM25 term index built in-memory.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row icon={Layers} label="Indexed chunks" value={String(stats.corpus.chunkCount)} />
            <Row icon={Hash} label="Unique terms" value={stats.corpus.uniqueTerms.toLocaleString()} />
            <Row icon={TrendingUp} label="Avg tokens / chunk" value={String(stats.corpus.avgTokensPerChunk)} />
            <Row icon={FileText} label="Source notes" value={String(stats.corpus.noteCount)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Decisions by project
            </CardTitle>
            <CardDescription>
              Where your extracted technical rationale lives.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {stats.decisionsByProject.length === 0 && (
              <p className="text-sm text-muted-foreground">No decisions yet.</p>
            )}
            {stats.decisionsByProject.map((d) => {
              const max = Math.max(...stats.decisionsByProject.map((x) => x.count), 1)
              return (
                <div key={d.project} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono">{d.project}</span>
                    <span className="text-muted-foreground">{d.count}</span>
                  </div>
                  <Progress value={(d.count / max) * 100} className="h-1.5" />
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Email sources */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email activity by source
          </CardTitle>
          <CardDescription>
            Where sent emails originate — chat answers, decision briefs, digests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.emailsBySource.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Mail className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                No emails sent yet. Use the Compose button or email a chat answer.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stats.emailsBySource.map((e) => (
                <Badge
                  key={e.sourceType}
                  variant="outline"
                  className="text-xs capitalize"
                >
                  {e.sourceType}: {e.count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick start hint */}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Try it now</p>
          <p className="text-muted-foreground">
            Open <button className="text-primary underline underline-offset-2" onClick={() => setSection("chat")}>Chat</button> and ask
            &quot;why did we pick postgres?&quot; — the answer will cite the exact note
            chunks it drew from. Then email yourself the answer.
          </p>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: number
  sub: string
  accent: "emerald" | "teal" | "amber" | "rose"
  onClick?: () => void
}) {
  const accentClass = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 group-hover:bg-emerald-500/20",
    teal: "text-teal-600 dark:text-teal-400 bg-teal-500/10 group-hover:bg-teal-500/20",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10 group-hover:bg-amber-500/20",
    rose: "text-rose-600 dark:text-rose-400 bg-rose-500/10 group-hover:bg-rose-500/20",
  }[accent]
  return (
    <Card
      className={`group relative overflow-hidden transition-all duration-200 ${
        onClick
          ? "cursor-pointer hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
          : ""
      }`}
      onClick={onClick}
    >
      {/* Subtle top gradient line */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity ${
        accent === "emerald" ? "from-emerald-500/0 via-emerald-500/50 to-emerald-500/0" :
        accent === "teal" ? "from-teal-500/0 via-teal-500/50 to-teal-500/0" :
        accent === "amber" ? "from-amber-500/0 via-amber-500/50 to-amber-500/0" :
        "from-rose-500/0 via-rose-500/50 to-rose-500/0"
      }`} />
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
          <div className={`rounded-md p-1.5 transition-colors ${accentClass}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  )
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
