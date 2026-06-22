"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Mail, FileText, Hash, Loader2 } from "lucide-react"
import { useMemex } from "./store"
import type { ChunkDetail } from "./types"

export function SourcePanel() {
  const chunkId = useMemex((s) => s.sourceChunkId)
  const closeSource = useMemex((s) => s.closeSource)
  const openEmail = useMemex((s) => s.openEmailComposer)

  const { data, isLoading, error } = useQuery<ChunkDetail>({
    queryKey: ["chunk", chunkId],
    queryFn: async () => {
      const res = await fetch(`/api/chunks/${chunkId}`)
      if (!res.ok) throw new Error("Failed to load chunk")
      return res.json()
    },
    enabled: !!chunkId,
  })

  return (
    <Sheet open={!!chunkId} onOpenChange={(o) => !o && closeSource()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Source chunk
          </SheetTitle>
          <SheetDescription className="sr-only">
            Full text of the cited source chunk and its parent note.
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="p-4 text-sm text-destructive">Failed to load source.</div>
        )}
        {data?.chunk && (
          <SourcePanelBody chunk={data.chunk} onEmail={() => openEmail({
            subject: `Source: ${data.chunk.note.sourcePath}`,
            bodyMarkdown: `# ${data.chunk.note.title}\n\n_Source: ${data.chunk.note.sourcePath}${data.chunk.headingPath ? ` › ${data.chunk.headingPath}` : ""}_\n\n---\n\n${data.chunk.text}\n\n---\n_Sent from Memex · citation-first knowledge retrieval_\n`,
            sourceType: "note",
            sourceId: data.chunk.note.id,
          })} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function SourcePanelBody({
  chunk,
  onEmail,
}: {
  chunk: ChunkDetail["chunk"]
  onEmail: () => void
}) {
  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {/* Note header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sm leading-tight">{chunk.note.title}</h3>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {chunk.note.sourcePath}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={onEmail} className="shrink-0">
              <Mail className="h-3.5 w-3.5 mr-1" />
              Email
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-[10px]">
              {chunk.note.project}
            </Badge>
            {chunk.note.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* Chunk metadata */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border border-border p-2">
            <div className="text-muted-foreground">Section</div>
            <div className="font-medium truncate" title={chunk.headingPath}>
              {chunk.headingPath || "—"}
            </div>
          </div>
          <div className="rounded-md border border-border p-2">
            <div className="text-muted-foreground">Chunk #</div>
            <div className="font-medium flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {chunk.chunkIndex}
            </div>
          </div>
          <div className="rounded-md border border-border p-2">
            <div className="text-muted-foreground">Tokens</div>
            <div className="font-medium">{chunk.tokens}</div>
          </div>
        </div>

        <Separator />

        {/* Chunk text */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chunk text
          </h4>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap font-mono text-[13px]">
            {chunk.text}
          </div>
        </div>

        {/* Related decisions */}
        {chunk.decisions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Decisions in this chunk ({chunk.decisions.length})
              </h4>
              <div className="space-y-2">
                {chunk.decisions.map((d) => (
                  <div key={d.id} className="rounded-md border border-border p-2">
                    <div className="text-sm font-medium">{d.title}</div>
                    {d.decisionDate && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Decided: {d.decisionDate}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {d.rationale}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  )
}
