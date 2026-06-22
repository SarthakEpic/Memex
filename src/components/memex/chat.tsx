"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Card,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Send,
  Loader2,
  Sparkles,
  Mail,
  Copy,
  Check,
  User,
  Bot,
  Plus,
  History,
  Trash2,
  FileText,
  AlertTriangle,
  Download,
  Pencil,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { useMemex } from "./store"
import { AnswerRenderer } from "./answer-renderer"
import type { ChatMessageData, ChatSessionSummary, Citation } from "./types"

const SUGGESTED = [
  "Why did we pick postgres?",
  "What did we decide about caching?",
  "Why Llama 3.1 8B and not Mistral?",
  "How does the reranker help retrieval?",
  "Why Keycloak over Auth0?",
]

export function Chat() {
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [streamingAnswer, setStreamingAnswer] = useState<{
    answer: string
    citations: Citation[]
    refused: boolean
    serviceError: boolean
  } | null>(null)
  const sessionId = useMemex((s) => s.activeSessionId)
  const setSessionId = useMemex((s) => s.setActiveSession)
  const openEmail = useMemex((s) => s.openEmailComposer)
  const qc = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load messages for active session
  const { data: sessionData } = useQuery<{
    session: { id: string; title: string; messages: ChatMessageData[] }
  }>({
    queryKey: ["chat-session", sessionId],
    queryFn: async () => {
      const r = await fetch(`/api/chat/sessions/${sessionId}`)
      return r.json()
    },
    enabled: !!sessionId,
  })

  // Sessions list (sidebar)
  const { data: sessionsData } = useQuery<{ sessions: ChatSessionSummary[] }>({
    queryKey: ["chat-sessions"],
    queryFn: async () => {
      const r = await fetch("/api/chat/sessions")
      return r.json()
    },
  })

  const messages = sessionData?.session?.messages ?? []

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages.length, streamingAnswer])

  const handleSend = async (text?: string) => {
    const message = (text ?? input).trim()
    if (!message || sending) return
    setInput("")
    setSending(true)
    setStreamingAnswer({
      answer: "",
      citations: [],
      refused: false,
      serviceError: false,
    })

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId, rerank: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Chat failed")

      // Animate the answer in token-by-token
      const target = data.answer as string
      const words = target.split(" ")
      let i = 0
      const tick = () => {
        i = Math.min(i + Math.max(1, Math.floor(words.length / 40)), words.length)
        setStreamingAnswer({
          answer: words.slice(0, i).join(" "),
          citations: data.citations,
          refused: data.refused,
          serviceError: data.serviceError,
        })
        if (i < words.length) {
          setTimeout(tick, 20)
        } else {
          // Finalize — invalidate to load persisted message
          setStreamingAnswer(null)
          setSessionId(data.sessionId)
          qc.invalidateQueries({ queryKey: ["chat-session", data.sessionId] })
          qc.invalidateQueries({ queryKey: ["chat-sessions"] })
          qc.invalidateQueries({ queryKey: ["stats"] })
          setSending(false)
        }
      }
      tick()
    } catch (e: any) {
      toast.error(e.message || "Chat failed")
      setStreamingAnswer(null)
      setSending(false)
    }
  }

  const handleNewChat = () => {
    setSessionId(null)
    setStreamingAnswer(null)
  }

  const handleDeleteSession = async (id: string) => {
    await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" })
    if (sessionId === id) setSessionId(null)
    qc.invalidateQueries({ queryKey: ["chat-sessions"] })
    toast.success("Chat deleted")
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditTitle(currentTitle)
  }

  const saveRename = async () => {
    if (!editingId || !editTitle.trim()) {
      setEditingId(null)
      return
    }
    try {
      await fetch(`/api/chat/sessions/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      })
      qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      if (sessionId === editingId) {
        qc.invalidateQueries({ queryKey: ["chat-session", editingId] })
      }
      toast.success("Chat renamed")
    } catch {
      toast.error("Rename failed")
    }
    setEditingId(null)
  }

  const handleEmailAnswer = (answer: string, citations: Citation[]) => {
    const citeList = citations.length
      ? `\n\n## Sources\n${citations
          .map((c) => `- ${c.sourcePath}${c.headingPath ? ` › ${c.headingPath}` : ""} (chunk ${c.chunkIndex})`)
          .join("\n")}\n`
      : ""
    openEmail({
      subject: "Memex answer: " + (messages.find((m) => m.role === "user")?.content.slice(0, 50) ?? "your question"),
      bodyMarkdown: `${answer}${citeList}\n---\n_Sent from Memex · citation-first knowledge retrieval_\n`,
      sourceType: "chat",
    })
  }

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      <div className="hidden lg:flex w-56 shrink-0 flex-col border-r border-border bg-sidebar/30">
        <div className="p-3 border-b border-border">
          <Button size="sm" variant="outline" className="w-full" onClick={handleNewChat}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {sessionsData?.sessions.length === 0 && (
              <p className="text-xs text-muted-foreground p-3 text-center">
                No chats yet. Ask your first question.
              </p>
            )}
            {sessionsData?.sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors cursor-pointer ${
                  sessionId === s.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                }`}
                onClick={() => editingId !== s.id && setSessionId(s.id)}
              >
                <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {editingId === s.id ? (
                  <div className="flex-1 min-w-0 flex items-center gap-1">
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename()
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 bg-background border border-primary rounded px-1 py-0.5 text-xs"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); saveRename() }}
                      className="text-emerald-600 hover:text-emerald-700 shrink-0"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{s.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {s.messageCount} msgs
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        startRename(s.id, s.title)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteSession(s.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">
              {sessionData?.session?.title ?? "New chat"}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Citation-first · answers cite source chunks or honestly refuse
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sessionData?.session && messages.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => exportChat(sessionData.session, "md")}
                title="Export as Markdown"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Export
              </Button>
            )}
            {sessionData?.session && (
              <Badge variant="outline" className="text-[10px]">
                {messages.length} messages
              </Badge>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
            {messages.length === 0 && !streamingAnswer && (
              <EmptyState onPick={handleSend} />
            )}

            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onEmail={() => handleEmailAnswer(m.content, m.citations)}
              />
            ))}

            {streamingAnswer && (
              <div className="flex gap-3 memex-fade-up">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  {streamingAnswer.answer ? (
                    <AnswerRenderer answer={streamingAnswer.answer} />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Retrieving + reasoning…
                    </div>
                  )}
                  {streamingAnswer.citations.length > 0 && streamingAnswer.answer === messages[0]?.content && (
                    <CitationStrip citations={streamingAnswer.citations} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-background/95 backdrop-blur p-3">
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Ask about your notes…  e.g. why did we pick postgres?"
                className="min-h-[52px] max-h-[160px] resize-none pr-24 text-sm"
                disabled={sending}
              />
              <Button
                size="sm"
                className="absolute right-2 bottom-2"
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Send
                  </>
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
              Press Enter to send · Shift+Enter for newline · answers cite source
              chunks inline
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="text-center py-10 space-y-6">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold">Ask anything about your notes</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Memex retrieves the most relevant chunks from your Markdown corpus and
          generates an answer that cites them inline. If it can&apos;t find a source,
          it says so.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
        {SUGGESTED.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  onEmail,
}: {
  message: ChatMessageData
  onEmail: () => void
}) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === "user"
  const isServiceError = message.content.startsWith("⚠️")
  const isRefusal =
    !isUser &&
    message.citations.length === 0 &&
    !isServiceError &&
    message.content.trim().toLowerCase().startsWith("i don't have a source for this")

  return (
    <div className="flex gap-3 memex-fade-up">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-muted text-muted-foreground"
            : isServiceError
            ? "bg-amber-500 text-white"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : isServiceError ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <>
            <AnswerRenderer answer={message.content} />
            {isServiceError && (
              <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mt-1 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>The reasoning service hit a rate limit. Please retry in a few seconds.</span>
              </div>
            )}
            {isRefusal && (
              <div className="text-xs text-muted-foreground italic flex items-center gap-1.5 mt-1">
                <FileText className="h-3 w-3" />
                No source citation — the model honestly refused.
              </div>
            )}
            {message.citations.length > 0 && (
              <CitationStrip citations={message.citations} />
            )}
            <div className="flex items-center gap-1 pt-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEmail}>
                <Mail className="h-3 w-3 mr-1" />
                Email
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(message.content)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CitationStrip({ citations }: { citations: Citation[] }) {
  const openSource = useMemex((s) => s.openSource)
  return (
    <div className="space-y-1.5">
      <Separator className="my-1" />
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        Sources ({citations.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c) => (
          <button
            key={c.chunkId}
            onClick={() => openSource(c.chunkId)}
            className="group flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-border hover:border-primary/50 hover:bg-accent transition-colors text-left max-w-[280px]"
          >
            <FileText className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate">
              {c.sourcePath}
              <span className="text-muted-foreground"> · #{c.chunkIndex}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Export a chat session as a Markdown file download.
function exportChat(
  session: { id: string; title: string; messages: ChatMessageData[] },
  format: "md" | "json"
) {
  const stamp = new Date().toISOString().slice(0, 10)
  let content: string
  let mime: string
  let ext: string

  if (format === "json") {
    content = JSON.stringify(session, null, 2)
    mime = "application/json"
    ext = "json"
  } else {
    const lines: string[] = []
    lines.push(`# ${session.title}`)
    lines.push("")
    lines.push(`_Exported from Memex on ${new Date().toLocaleString()}_`)
    lines.push(`_Session ID: ${session.id} · ${session.messages.length} messages_`)
    lines.push("")
    lines.push("---")
    lines.push("")
    for (const m of session.messages) {
      const role = m.role === "user" ? "🧑 You" : "🤖 Memex"
      const time = new Date(m.createdAt).toLocaleString()
      lines.push(`## ${role}`)
      lines.push(`_${time}_`)
      lines.push("")
      lines.push(m.content)
      if (m.citations.length > 0) {
        lines.push("")
        lines.push("**Sources:**")
        for (const c of m.citations) {
          lines.push(`- ${c.sourcePath} (chunk #${c.chunkIndex}) — _${c.snippet.slice(0, 100)}…_`)
        }
      }
      lines.push("")
      lines.push("---")
      lines.push("")
    }
    content = lines.join("\n")
    mime = "text/markdown"
    ext = "md"
  }

  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `memex-chat-${stamp}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success(`Exported as ${ext.toUpperCase()}`)
}
