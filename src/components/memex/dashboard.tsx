"use client"

import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  FilePlus2,
  FileText,
  Inbox,
  Mail,
  MessageSquare,
  ShieldCheck,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { apiRequest } from "@/lib/client-api"
import { SectionError } from "./section-state"
import { useMemex } from "./store"
import type {
  EmailAccountData,
  StatsData,
  TimelineEvent,
} from "./types"

interface AiStatus {
  providerName: string
  model: string
  configured: boolean
}

interface AuthResponse {
  user: { name: string; email: string } | null
}

export function Dashboard() {
  const setSection = useMemex((state) => state.setSection)
  const setActiveSession = useMemex((state) => state.setActiveSession)
  const openEmail = useMemex((state) => state.openEmailComposer)
  const openNoteComposer = useMemex((state) => state.openNoteComposer)
  const openNote = useMemex((state) => state.openNote)
  const openDecision = useMemex((state) => state.openDecision)

  const statsQuery = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: () => apiRequest<StatsData>("/api/stats"),
  })
  const timelineQuery = useQuery<{ events: TimelineEvent[] }>({
    queryKey: ["timeline", ""],
    queryFn: () => apiRequest<{ events: TimelineEvent[] }>("/api/timeline"),
  })
  const aiQuery = useQuery<AiStatus>({
    queryKey: ["ai-status"],
    queryFn: () => apiRequest<AiStatus>("/api/ai-status"),
  })
  const accountsQuery = useQuery<{ accounts: EmailAccountData[] }>({
    queryKey: ["email-accounts"],
    queryFn: () =>
      apiRequest<{ accounts: EmailAccountData[] }>("/api/email-accounts"),
  })
  const authQuery = useQuery<AuthResponse>({
    queryKey: ["auth-user"],
    queryFn: () => apiRequest<AuthResponse>("/api/auth/me"),
  })

  const primaryError =
    statsQuery.error ||
    timelineQuery.error ||
    aiQuery.error ||
    accountsQuery.error

  if (primaryError) {
    return (
      <SectionError
        title="Home could not be loaded"
        error={primaryError}
        onRetry={() => {
          void Promise.all([
            statsQuery.refetch(),
            timelineQuery.refetch(),
            aiQuery.refetch(),
            accountsQuery.refetch(),
          ])
        }}
      />
    )
  }

  if (
    statsQuery.isLoading ||
    timelineQuery.isLoading ||
    aiQuery.isLoading ||
    accountsQuery.isLoading ||
    !statsQuery.data ||
    !aiQuery.data
  ) {
    return <DashboardSkeleton />
  }

  const stats = statsQuery.data
  const counts = stats.counts
  const aiStatus = aiQuery.data
  const accounts = accountsQuery.data?.accounts ?? []
  const connectedAccounts = accounts.filter((account) => account.connected)
  const recentEvents = (timelineQuery.data?.events ?? []).slice(0, 5)
  const firstName = authQuery.data?.user?.name?.trim().split(/\s+/)[0] || "there"

  const attentionItems = [
    counts.notes === 0
      ? {
          id: "notes",
          icon: FilePlus2,
          title: "Add your first source",
          description: "Chat and decision extraction need at least one note.",
          action: openNoteComposer,
          actionLabel: "Add note",
        }
      : null,
    !aiStatus.configured
      ? {
          id: "ai",
          icon: Bot,
          title: "Connect an AI provider",
          description: "AI-assisted workflows are unavailable until a provider is configured.",
          action: () => setSection("settings"),
          actionLabel: "Open settings",
        }
      : null,
    connectedAccounts.length === 0
      ? {
          id: "inbox",
          icon: Inbox,
          title: "Inbox is not connected",
          description: "Connect an account when you are ready to manage incoming mail.",
          action: () => setSection("inbox"),
          actionLabel: "Open inbox",
        }
      : null,
    counts.urgentInbox > 0
      ? {
          id: "urgent",
          icon: AlertTriangle,
          title: `${counts.urgentInbox} urgent email${counts.urgentInbox === 1 ? "" : "s"}`,
          description: "Review time-sensitive messages before working through the rest.",
          action: () => setSection("inbox"),
          actionLabel: "Review urgent",
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string
    icon: React.ElementType
    title: string
    description: string
    action: () => void
    actionLabel: string
  }>

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 memex-fade-up">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Workspace overview
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Your knowledge, conversations, decisions, and email work in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openNoteComposer}>
            <FilePlus2 className="mr-1.5 h-4 w-4" />
            Add note
          </Button>
          <Button
            onClick={() => {
              setActiveSession(null)
              setSection("chat")
            }}
          >
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Ask Memex
          </Button>
        </div>
      </header>

      <section aria-labelledby="workspace-status" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="workspace-status" className="text-sm font-semibold">
              Workspace status
            </h2>
            <p className="text-xs text-muted-foreground">
              Live readiness of the services behind your workspace.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5 text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Online
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <StatusCard
            icon={Bot}
            label="AI"
            value={aiStatus.configured ? aiStatus.providerName : "Not configured"}
            detail={aiStatus.configured ? aiStatus.model : "Required for assisted workflows"}
            ready={aiStatus.configured}
            onClick={() => setSection("settings")}
          />
          <StatusCard
            icon={Database}
            label="Knowledge base"
            value={`${counts.notes} note${counts.notes === 1 ? "" : "s"}`}
            detail={`${stats.corpus.chunkCount} searchable chunks`}
            ready={counts.notes > 0}
            onClick={() => setSection("notes")}
          />
          <StatusCard
            icon={Inbox}
            label="Inbox"
            value={
              connectedAccounts.length > 0
                ? `${connectedAccounts.length} connected`
                : "Not connected"
            }
            detail={
              connectedAccounts.length > 0
                ? `${counts.unreadInbox} unread messages`
                : "Optional email integration"
            }
            ready={connectedAccounts.length > 0}
            onClick={() => setSection("inbox")}
          />
        </div>
      </section>

      <section aria-labelledby="workspace-metrics" className="space-y-3">
        <h2 id="workspace-metrics" className="text-sm font-semibold">
          At a glance
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={FileText} label="Notes" value={counts.notes} onClick={() => setSection("notes")} />
          <MetricCard icon={Brain} label="Decisions" value={counts.decisions} onClick={() => setSection("decisions")} />
          <MetricCard icon={MessageSquare} label="Questions" value={counts.messages} onClick={() => setSection("chat")} />
          <MetricCard icon={Mail} label="Emails sent" value={counts.emailsDelivered} onClick={() => setSection("email")} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Needs attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {attentionItems.length === 0 ? (
              <div className="flex items-start gap-3 py-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium">Core services are ready</p>
                  <p className="text-xs text-muted-foreground">
                    No setup issue or urgent inbox item needs action.
                  </p>
                </div>
              </div>
            ) : (
              attentionItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    <span className="hidden text-xs font-medium text-primary sm:block">
                      {item.actionLabel}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Source integrity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {counts.noteAnswers === 0 ? (
              <div className="py-3">
                <p className="text-sm font-medium">Not enough data yet</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Citation coverage appears after you ask a question about your notes.
                </p>
              </div>
            ) : (
              <>
                <MetricProgress
                  label="Answers with citations"
                  value={stats.citationCoverage ?? 0}
                />
                <MetricProgress
                  label="Honest source refusals"
                  value={stats.refusalRate ?? 0}
                />
                <p className="text-[11px] text-muted-foreground">
                  Based on {counts.noteAnswers} source-backed answer{counts.noteAnswers === 1 ? "" : "s"}.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="recent-activity" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="recent-activity" className="text-sm font-semibold">
            Recent activity
          </h2>
          {recentEvents.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSection("timeline")}>
              View timeline
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {recentEvents.length === 0 ? (
          <div className="border-t border-border py-8 text-center">
            <Clock3 className="mx-auto h-6 w-6 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium">No activity yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Notes and extracted decisions will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {recentEvents.map((event) => (
              <button
                key={`${event.type}-${event.id}`}
                onClick={() =>
                  event.type === "note"
                    ? openNote(event.id)
                    : openDecision(event.id)
                }
                className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/50"
              >
                <div className="ml-2 flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  {event.type === "note" ? (
                    <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Brain className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.project} · {formatRelativeTime(event.timestamp)}
                  </p>
                </div>
                <ArrowRight className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={() => openEmail({ sourceType: "manual" })}>
          <Mail className="mr-1.5 h-3.5 w-3.5" />
          Compose email
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSection("analytics")}>
          <Database className="mr-1.5 h-3.5 w-3.5" />
          View analytics
        </Button>
      </div>
    </div>
  )
}

function StatusCard({
  icon: Icon,
  label,
  value,
  detail,
  ready,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: string
  detail: string
  ready: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4 w-4" />
      </div>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-medium uppercase text-muted-foreground">
          {label}
        </span>
        <span className="block truncate text-sm font-semibold">{value}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {detail}
        </span>
      </span>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          ready ? "bg-emerald-500" : "bg-amber-500"
        }`}
        aria-label={ready ? "Ready" : "Needs setup"}
      />
    </button>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: number
  onClick: () => void
}) {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <button onClick={onClick} className="w-full text-left">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        </CardContent>
      </button>
    </Card>
  )
}

function MetricProgress({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}%</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="h-24 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-20 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    </div>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000))

  if (diffMinutes < 1) return "Just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}