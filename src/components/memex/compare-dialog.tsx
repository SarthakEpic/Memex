"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { GitCompare, Loader2, X } from "lucide-react"
import type { ChatMessageData, ChatSessionSummary } from "./types"

interface CompareDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
}

export function CompareDialog({ open, onOpenChange }: CompareDialogProps) {
  const [sessionAId, setSessionAId] = useState<string>("")
  const [sessionBId, setSessionBId] = useState<string>("")

  // Load all sessions
  const { data: sessionsData } = useQuery<{ sessions: ChatSessionSummary[] }>({
    queryKey: ["chat-sessions"],
    queryFn: async () => {
      const r = await fetch("/api/chat/sessions")
      return r.json()
    },
    enabled: open,
  })

  // Load full sessions when selected
  const { data: dataA, isLoading: loadingA } = useQuery<{
    session: { id: string; title: string; messages: ChatMessageData[] }
  }>({
    queryKey: ["chat-session", sessionAId],
    queryFn: async () => {
      const r = await fetch(`/api/chat/sessions/${sessionAId}`)
      return r.json()
    },
    enabled: open && !!sessionAId,
  })
  const { data: dataB, isLoading: loadingB } = useQuery<{
    session: { id: string; title: string; messages: ChatMessageData[] }
  }>({
    queryKey: ["chat-session", sessionBId],
    queryFn: async () => {
      const r = await fetch(`/api/chat/sessions/${sessionBId}`)
      return r.json()
    },
    enabled: open && !!sessionBId,
  })

  const sessions = sessionsData?.sessions ?? []
  const messagesA = dataA?.session?.messages ?? []
  const messagesB = dataB?.session?.messages ?? []

  // Extract just the Q&A pairs (user question + assistant answer)
  const qaA = extractQAPairs(messagesA)
  const qaB = extractQAPairs(messagesB)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-primary" />
            A/B Compare chat answers
          </DialogTitle>
          <DialogDescription>
            Pick two chat sessions to compare their Q&amp;A side by side. Useful
            for seeing how answers differ across retrieval runs.
          </DialogDescription>
        </DialogHeader>

        {/* Session selectors */}
        <div className="p-4 border-b border-border grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Session A
            </label>
            <Select value={sessionAId} onValueChange={setSessionAId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Pick a chat session…" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={s.id === sessionBId}>
                    {s.title} ({s.messageCount} msgs)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Session B
            </label>
            <Select value={sessionBId} onValueChange={setSessionBId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Pick a chat session…" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={s.id === sessionAId}>
                    {s.title} ({s.messageCount} msgs)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Comparison area */}
        <ScrollArea className="flex-1 thin-scroll">
          <div className="p-4">
            {!sessionAId && !sessionBId ? (
              <div className="text-center py-12 space-y-2">
                <GitCompare className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium">Select two sessions to compare</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Each session&apos;s questions and cited answers will appear side by side.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Column A */}
                <div className="space-y-3">
                  <div className="sticky top-0 bg-background/95 backdrop-blur py-1.5 z-10">
                    <Badge variant="outline" className="text-[10px]">
                      A: {dataA?.session?.title ?? "—"}
                    </Badge>
                  </div>
                  {loadingA && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!loadingA && qaA.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No Q&amp;A pairs in this session.
                    </p>
                  )}
                  {qaA.map((qa, i) => (
                    <QACard key={i} qa={qa} side="A" />
                  ))}
                </div>

                {/* Column B */}
                <div className="space-y-3">
                  <div className="sticky top-0 bg-background/95 backdrop-blur py-1.5 z-10">
                    <Badge variant="outline" className="text-[10px]">
                      B: {dataB?.session?.title ?? "—"}
                    </Badge>
                  </div>
                  {loadingB && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!loadingB && qaB.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No Q&amp;A pairs in this session.
                    </p>
                  )}
                  {qaB.map((qa, i) => (
                    <QACard key={i} qa={qa} side="B" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

interface QAPair {
  question: string
  answer: string
  citations: { chunkId: string; sourcePath: string; chunkIndex: number }[]
}

function extractQAPairs(messages: ChatMessageData[]): QAPair[] {
  const pairs: QAPair[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") {
      const answer = messages[i + 1]
      if (answer && answer.role === "assistant") {
        pairs.push({
          question: messages[i].content,
          answer: answer.content,
          citations: answer.citations.map((c) => ({
            chunkId: c.chunkId,
            sourcePath: c.sourcePath,
            chunkIndex: c.chunkIndex,
          })),
        })
      }
    }
  }
  return pairs
}

function QACard({ qa, side }: { qa: QAPair; side: "A" | "B" }) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2 bg-card">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${side === "A" ? "bg-primary" : "bg-amber-500"}`} />
          Question
        </div>
        <p className="text-xs font-medium">{qa.question}</p>
      </div>
      <Separator />
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          Answer
        </div>
        <p className="text-xs text-foreground/80 line-clamp-6 leading-relaxed whitespace-pre-wrap">
          {qa.answer}
        </p>
      </div>
      {qa.citations.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Citations ({qa.citations.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {qa.citations.map((c, i) => (
                <Badge key={i} variant="outline" className="text-[9px] font-mono">
                  {c.sourcePath.split("/").pop()}#{c.chunkIndex}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
