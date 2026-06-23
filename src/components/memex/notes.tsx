"use client"

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  FileText,
  Trash2,
  Loader2,
  Mail,
  Brain,
  Layers,
  Calendar,
  Search,
  Sparkles,
  Link2,
  Globe,
  Pencil,
  Copy,
  Pin,
  PinOff,
  Download,
  Clock3,
  Mic,
  FileUp,
  Check,
} from "lucide-react"
import { toast } from "sonner"
import { useMemex } from "./store"
import { MarkdownPreview } from "./markdown-preview"
import { NoteToc } from "./note-toc"
import { FileUploadDialog } from "./file-upload-dialog"
import { AudioNoteDialog } from "./audio-note-dialog"
import { useRecentSearches } from "./use-recent-searches"
import type { NoteSummary, NoteDetail } from "./types"

export function Notes() {
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [openAdd, setOpenAdd] = useState(false)
  const [openImport, setOpenImport] = useState(false)
  const [openUpload, setOpenUpload] = useState(false)
  const [openAudio, setOpenAudio] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const { recent, addSearch, clearSearches } = useRecentSearches("memex-note-searches")

  // Listen for note updates from audio/file imports
  useEffect(() => {
    const handler = () => {
      qc.invalidateQueries({ queryKey: ["notes"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
      qc.invalidateQueries({ queryKey: ["decisions"] })
      qc.invalidateQueries({ queryKey: ["timeline"] })
    }
    window.addEventListener("memex-notes-updated", handler)
    return () => window.removeEventListener("memex-notes-updated", handler)
  }, [qc])

  const { data: notesData, isLoading } = useQuery<{ notes: NoteSummary[] }>({
    queryKey: ["notes"],
    queryFn: async () => {
      const r = await fetch("/api/notes")
      return r.json()
    },
  })

  // Compute available tags from all notes (sorted by frequency)
  const allTags = (() => {
    const counts = new Map<string, number>()
    for (const n of notesData?.notes ?? []) {
      for (const t of n.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
  })()

  const filtered = (notesData?.notes ?? []).filter(
    (n) =>
      (!search ||
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())) ||
        n.project.toLowerCase().includes(search.toLowerCase())) &&
      (!activeTag || n.tags.includes(activeTag)) &&
      (!pinnedOnly || n.pinned)
  )

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="w-full lg:w-80 shrink-0 flex flex-col border-r border-border">
        <div className="p-3 border-b border-border space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Notes</h2>
              <button
                onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()) }}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                  bulkMode
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
                title="Select multiple notes"
              >
                <Layers className="h-2.5 w-2.5" />
                Select
              </button>
              <button
                onClick={() => setPinnedOnly((p) => !p)}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                  pinnedOnly
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
                title="Show only pinned notes"
              >
                <Pin className="h-2.5 w-2.5" />
                Pinned
              </button>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => {
                  window.open("/api/notes/export-all", "_blank")
                  toast.success("Exporting all notes…")
                }}
                title="Export all notes as Markdown"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setOpenAdd(true)} className="cursor-pointer">
                    <Plus className="h-3.5 w-3.5 mr-2" />
                    Write note manually
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOpenImport(true)} className="cursor-pointer">
                    <Link2 className="h-3.5 w-3.5 mr-2" />
                    Import from URL
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOpenUpload(true)} className="cursor-pointer">
                    <FileUp className="h-3.5 w-3.5 mr-2" />
                    Upload file (PDF/Word/PPT)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOpenAudio(true)} className="cursor-pointer">
                    <Mic className="h-3.5 w-3.5 mr-2" />
                    Audio to note (speak)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  addSearch(search.trim())
                  setSearchFocused(false)
                }
              }}
              placeholder="Search notes…"
              className="text-xs pl-8 h-8"
            />
            {/* Recent searches dropdown */}
            {searchFocused && !search && recent.length > 0 && (
              <div className="absolute z-20 top-9 left-0 right-0 rounded-md border border-border bg-popover shadow-md p-1.5 space-y-0.5">
                <div className="flex items-center justify-between px-1.5 py-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    Recent searches
                  </span>
                  <button
                    onClick={clearSearches}
                    className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Clear
                  </button>
                </div>
                {recent.map((term) => (
                  <button
                    key={term}
                    onClick={() => {
                      setSearch(term)
                      addSearch(term)
                      setSearchFocused(false)
                    }}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-xs text-left hover:bg-accent transition-colors"
                  >
                    <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{term}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {allTags.slice(0, 12).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                    activeTag === tag
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {tag}
                </button>
              ))}
              {activeTag && (
                <button
                  onClick={() => setActiveTag(null)}
                  className="text-[10px] px-1.5 py-0.5 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                >
                  ✕ clear
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
          <div className="p-2 space-y-1">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {filtered.length === 0 && !isLoading && (
              <p className="text-xs text-muted-foreground p-4 text-center">
                {search ? "No notes match." : "No notes yet. Add your first one."}
              </p>
            )}
            {filtered.map((n) => (
              <NoteListItem
                key={n.id}
                note={n}
                active={selectedId === n.id}
                bulkMode={bulkMode}
                bulkSelected={selectedIds.has(n.id)}
                onClick={() => {
                  if (bulkMode) {
                    const next = new Set(selectedIds)
                    if (next.has(n.id)) next.delete(n.id)
                    else next.add(n.id)
                    setSelectedIds(next)
                  } else {
                    setSelectedId(n.id)
                  }
                }}
                onDelete={async () => {
                  await fetch(`/api/notes/${n.id}`, { method: "DELETE" })
                  toast.success("Note deleted")
                  if (selectedId === n.id) setSelectedId(null)
                  qc.invalidateQueries({ queryKey: ["notes"] })
                  qc.invalidateQueries({ queryKey: ["stats"] })
                }}
                onTogglePin={async () => {
                  const r = await fetch("/api/pin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "note", id: n.id }),
                  })
                  const d = await r.json()
                  if (d.pinned) toast.success("Note pinned to top")
                  else toast.success("Note unpinned")
                  qc.invalidateQueries({ queryKey: ["notes"] })
                }}
              />
            ))}
          </div>
          </ScrollArea>
          {/* Bulk action bar */}
          {bulkMode && selectedIds.size > 0 && (
            <div className="border-t border-border p-2 flex items-center justify-between bg-muted/30">
              <span className="text-xs font-medium">{selectedIds.size} selected</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={async () => {
                    const ids = Array.from(selectedIds)
                    await fetch("/api/notes/bulk", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "pin", ids }),
                    })
                    toast.success(`Pinned ${ids.length} notes`)
                    setBulkMode(false)
                    setSelectedIds(new Set())
                    qc.invalidateQueries({ queryKey: ["notes"] })
                  }}
                >
                  <Pin className="h-3 w-3 mr-1" />
                  Pin
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    const ids = Array.from(selectedIds)
                    window.open(`/api/notes/bulk?action=export&ids=${ids.join(",")}`, "_blank")
                    toast.success("Exporting selected notes...")
                  }}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={async () => {
                    const ids = Array.from(selectedIds)
                    await fetch("/api/notes/bulk", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "delete", ids }),
                    })
                    toast.success(`Deleted ${ids.length} notes`)
                    setBulkMode(false)
                    setSelectedIds(new Set())
                    setSelectedId(null)
                    qc.invalidateQueries({ queryKey: ["notes"] })
                    qc.invalidateQueries({ queryKey: ["stats"] })
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0">
        {selectedId ? (
          <NoteDetailPanel noteId={selectedId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-medium">Select a note</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Pick a note from the list to view its full content, chunks, and
              extracted decisions.
            </p>
          </div>
        )}
      </div>

      <AddNoteDialog open={openAdd} onOpenChange={setOpenAdd} />
      <ImportUrlDialog open={openImport} onOpenChange={setOpenImport} />
      <FileUploadDialog open={openUpload} onOpenChange={setOpenUpload} />
      <AudioNoteDialog open={openAudio} onOpenChange={setOpenAudio} />
    </div>
  )
}

function NoteListItem({
  note,
  active,
  onClick,
  onDelete,
  onTogglePin,
  bulkMode = false,
  bulkSelected = false,
}: {
  note: NoteSummary
  active: boolean
  onClick: () => void
  onDelete: () => void
  onTogglePin: () => void
  bulkMode?: boolean
  bulkSelected?: boolean
}) {
  return (
    <div
      className={`group rounded-md p-2.5 cursor-pointer transition-colors relative ${
        active || bulkSelected ? "bg-accent" : "hover:bg-accent/50"
      } ${note.pinned ? "border-l-2 border-l-primary" : ""} ${bulkSelected ? "ring-1 ring-primary" : ""}`}
      onClick={onClick}
    >
      {bulkMode && (
        <div className="absolute top-2.5 right-2.5 z-10">
          <div className={`h-4 w-4 rounded border flex items-center justify-center ${
            bulkSelected ? "bg-primary border-primary" : "border-border bg-background"
          }`}>
            {bulkSelected && <Check className="h-3 w-3 text-primary-foreground" />}
          </div>
        </div>
      )}
      {note.pinned && (
        <Pin className="absolute top-2 right-2 h-3 w-3 text-primary fill-primary" />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate flex items-center gap-1">
            {note.pinned && <Pin className="h-3 w-3 text-primary shrink-0 fill-primary" />}
            {note.title}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
            {note.sourcePath}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onTogglePin()
            }}
            className={`transition-opacity hover:text-primary ${
              note.pinned
                ? "opacity-100 text-primary"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground"
            }`}
            title={note.pinned ? "Unpin" : "Pin to top"}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <Badge variant="secondary" className="text-[9px] h-4">
          {note.project}
        </Badge>
        {note.tags.slice(0, 2).map((t) => (
          <Badge key={t} variant="outline" className="text-[9px] h-4">
            {t}
          </Badge>
        ))}
        <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
          <Layers className="h-2.5 w-2.5" />
          {note.chunkCount}
        </span>
        {note.decisionCount > 0 && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
            <Brain className="h-2.5 w-2.5" />
            {note.decisionCount}
          </span>
        )}
      </div>
    </div>
  )
}

function NoteDetailPanel({ noteId }: { noteId: string }) {
  const qc = useQueryClient()
  const openEmail = useMemex((s) => s.openEmailComposer)
  const [openEdit, setOpenEdit] = useState(false)
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview")
  const { data, isLoading } = useQuery<{ note: NoteDetail }>({
    queryKey: ["note", noteId],
    queryFn: async () => {
      const r = await fetch(`/api/notes/${noteId}`)
      return r.json()
    },
  })

  const [extracting, setExtracting] = useState(false)

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const note = data.note

  const handleExtract = async () => {
    setExtracting(true)
    try {
      const r = await fetch("/api/decisions/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
      })
      const d = await r.json()
      toast.success(`Extracted ${d.extracted} decisions`)
      qc.invalidateQueries({ queryKey: ["note", noteId] })
      qc.invalidateQueries({ queryKey: ["decisions"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
    } catch {
      toast.error("Extraction failed")
    } finally {
      setExtracting(false)
    }
  }

  const handleDuplicate = async () => {
    try {
      const r = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${note.title} (copy)`,
          content: note.content,
          project: note.project,
          tags: note.tags,
          extractDecisions: false,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      toast.success(`Duplicated as "${d.title}"`, {
        description: `${d.chunkCount} chunks ingested`,
      })
      qc.invalidateQueries({ queryKey: ["notes"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
    } catch (e: any) {
      toast.error(e.message || "Duplicate failed")
    }
  }

  return (
    <>
    <ScrollArea className="h-full thin-scroll">
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl memex-fade-up">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">{note.title}</h1>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {note.sourcePath}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpenEdit(true)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={handleDuplicate}
                title="Duplicate note"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExtract}
                disabled={extracting}
              >
                {extracting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                )}
                Extract decisions
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  openEmail({
                    subject: `Note: ${note.title}`,
                    bodyMarkdown: `# ${note.title}\n\n_Source: ${note.sourcePath} · ${note.project}_\n\n---\n\n${note.content}\n\n---\n_Sent from Memex · citation-first knowledge retrieval_\n`,
                    sourceType: "note",
                    sourceId: note.id,
                  })
                }
              >
                <Mail className="h-3.5 w-3.5 mr-1" />
                Email
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <Badge variant="secondary" className="text-[10px]">
              {note.project}
            </Badge>
            {note.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                {t}
              </Badge>
            ))}
            <Separator orientation="vertical" className="h-3 mx-1" />
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {note.chunks.length} chunks
            </span>
            <span className="flex items-center gap-1">
              <Brain className="h-3 w-3" />
              {note.decisions.length} decisions
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(note.createdAt).toLocaleDateString()}
            </span>
            {(() => {
              const words = note.content.trim().split(/\s+/).filter(Boolean).length
              const readingTime = Math.max(1, Math.round(words / 200))
              return (
                <>
                  <Separator orientation="vertical" className="h-3 mx-1" />
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {words.toLocaleString()} words
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock3 className="h-3 w-3" />
                    {readingTime} min read
                  </span>
                </>
              )
            })()}
          </div>
        </div>

        <Separator />

        {/* Content + TOC */}
        <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                  Full content
                </CardTitle>
                <div className="flex items-center rounded-md border border-border p-0.5 text-[10px]">
                  <button
                    onClick={() => setViewMode("preview")}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      viewMode === "preview"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setViewMode("source")}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      viewMode === "source"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Source
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {viewMode === "preview" ? (
                <MarkdownPreview content={note.content} />
              ) : (
                <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground/90">
                  {note.content}
                </pre>
              )}
            </CardContent>
          </Card>
          {/* Table of contents — only in preview mode */}
          {viewMode === "preview" && (
            <div className="hidden lg:block">
              <div className="sticky top-4">
                <NoteToc content={note.content} />
              </div>
            </div>
          )}
        </div>

        {/* Chunks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" />
              Chunks ({note.chunks.length})
            </CardTitle>
            <CardDescription className="text-[11px]">
              The atomic units of retrieval. Each chunk is a separate search result.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {note.chunks.map((c) => (
              <div
                key={c.id}
                className="rounded-md border border-border p-2.5 text-xs"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{c.chunkIndex} · {c.headingPath || "—"}
                  </span>
                  <Badge variant="outline" className="text-[9px] h-4">
                    {c.tokens} tok
                  </Badge>
                </div>
                <p className="text-foreground/80 line-clamp-3 leading-relaxed">
                  {c.text}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Decisions */}
        {note.decisions.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <Brain className="h-3.5 w-3.5" />
                Extracted decisions ({note.decisions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {note.decisions.map((d) => (
                <div
                  key={d.id}
                  className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5"
                >
                  <div className="text-sm font-medium">{d.title}</div>
                  {d.decisionDate && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Decided: {d.decisionDate}
                    </div>
                  )}
                  <div className="text-xs text-foreground/80 mt-1 line-clamp-2">
                    {d.rationale}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
      <EditNoteDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        note={note}
      />
    </>
  )
}

function AddNoteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [project, setProject] = useState("general")
  const [tags, setTags] = useState("")
  const [extract, setExtract] = useState(true)
  const [saving, setSaving] = useState(false)
  const [splitView, setSplitView] = useState(false)

  const reset = () => {
    setTitle("")
    setContent("")
    setProject("general")
    setTags("")
    setExtract(true)
  }

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error("Content is required")
      return
    }
    setSaving(true)
    try {
      const r = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          content,
          project: project.trim() || "general",
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          extractDecisions: extract,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      toast.success(d.message || "Note ingested")
      reset()
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ["notes"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
      qc.invalidateQueries({ queryKey: ["decisions"] })
    } catch (e: any) {
      toast.error(e.message || "Failed to ingest note")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Write a Note
          </DialogTitle>
          <DialogDescription>
            Write in Markdown. Use <code className="text-xs px-1 py-0.5 rounded bg-muted">## Section</code> headings
            to organize your note. AI will auto-extract decisions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr] gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Title <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-detected from # heading"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tags (comma)</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="decision, db"
                className="text-sm"
              />
            </div>
          </div>

          {/* Quick start templates */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-muted-foreground self-center">Quick start:</span>
            {[
              { label: "Decision", text: "# \n\n## Context\n\n\n\n## Decision\n\n\n\n## Rationale\n\n\n\n## Alternatives Considered\n\n" },
              { label: "Meeting", text: "# Meeting Notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n\n\n\n## Discussion\n\n\n\n## Action Items\n\n- [ ] \n" },
              { label: "Blank", text: "" },
            ].map((tpl) => (
              <button
                key={tpl.label}
                onClick={() => { setContent(tpl.text); setSplitView(true) }}
                className="text-[10px] px-2 py-0.5 rounded-full border border-border hover:border-primary/40 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                {tpl.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Markdown content</Label>
              <div className="flex items-center rounded-md border border-border p-0.5 text-[10px]">
                <button
                  onClick={() => setSplitView(false)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    !splitView
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Edit
                </button>
                <button
                  onClick={() => setSplitView(true)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    splitView
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Split
                </button>
              </div>
            </div>
            {splitView ? (
              <div className="grid grid-cols-2 gap-2 min-h-[300px]">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={"# My note\n\n## A section\n\nSome decision here…"}
                  className="text-sm font-mono min-h-[300px] resize-none"
                />
                <div className="rounded-md border border-border bg-muted/20 p-3 overflow-y-auto thin-scroll min-h-[300px] max-h-[480px]">
                  {content ? (
                    <MarkdownPreview content={content} />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Live preview appears here…
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={"# My note\n\n## A section\n\nSome decision here…"}
                className="text-sm font-mono min-h-[300px] resize-y"
              />
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={extract}
              onChange={(e) => setExtract(e.target.checked)}
              className="rounded"
            />
            Extract decisions with LLM (best-effort, runs after chunking)
          </label>
        </div>

        <DialogFooter className="p-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Ingesting…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                Ingest note
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportUrlDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [url, setUrl] = useState("")
  const [project, setProject] = useState("web")
  const [tags, setTags] = useState("")
  const [extract, setExtract] = useState(true)
  const [importing, setImporting] = useState(false)

  const reset = () => {
    setUrl("")
    setProject("web")
    setTags("")
    setExtract(true)
  }

  const handleImport = async () => {
    if (!url.trim()) {
      toast.error("URL is required")
      return
    }
    if (!/^https?:\/\//.test(url.trim())) {
      toast.error("URL must start with http:// or https://")
      return
    }
    setImporting(true)
    try {
      const r = await fetch("/api/notes/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          project: project.trim() || "web",
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          extractDecisions: extract,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Import failed")
      toast.success(d.message || "URL imported")
      reset()
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ["notes"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
      qc.invalidateQueries({ queryKey: ["decisions"] })
      qc.invalidateQueries({ queryKey: ["timeline"] })
    } catch (e: any) {
      toast.error(e.message || "Failed to import URL")
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Import note from URL
          </DialogTitle>
          <DialogDescription>
            Fetches a web page, extracts its content, converts to Markdown, and
            ingests it as a note. Decisions are extracted automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="text-sm"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tags (comma)</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="article, web"
                className="text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={extract}
              onChange={(e) => setExtract(e.target.checked)}
              className="rounded"
            />
            Extract decisions with LLM (best-effort)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={importing || !url.trim()}>
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-1" />
                Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditNoteDialog({
  open,
  onOpenChange,
  note,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  note: NoteDetail
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [project, setProject] = useState(note.project)
  const [tags, setTags] = useState(note.tags.join(", "))
  const [extract, setExtract] = useState(true)
  const [saving, setSaving] = useState(false)
  const [splitView, setSplitView] = useState(false)

  // Reset form when the note changes or dialog opens
  useEffect(() => {
    if (open) {
      setTitle(note.title)
      setContent(note.content)
      setProject(note.project)
      setTags(note.tags.join(", "))
      setExtract(true)
    }
  }, [open, note.id])

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error("Content is required")
      return
    }
    setSaving(true)
    try {
      const r = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          content,
          project: project.trim() || "general",
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          extractDecisions: extract,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      toast.success(d.message || "Note updated")
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ["note", note.id] })
      qc.invalidateQueries({ queryKey: ["notes"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
      qc.invalidateQueries({ queryKey: ["decisions"] })
      qc.invalidateQueries({ queryKey: ["timeline"] })
    } catch (e: any) {
      toast.error(e.message || "Failed to update note")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Edit note
          </DialogTitle>
          <DialogDescription>
            Editing re-chunks the content and re-extracts decisions. Old chunks
            and decisions are replaced.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr] gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tags (comma)</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Markdown content</Label>
              <div className="flex items-center rounded-md border border-border p-0.5 text-[10px]">
                <button
                  onClick={() => setSplitView(false)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    !splitView
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Edit
                </button>
                <button
                  onClick={() => setSplitView(true)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    splitView
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Split
                </button>
              </div>
            </div>
            {splitView ? (
              <div className="grid grid-cols-2 gap-2 min-h-[320px]">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="text-sm font-mono min-h-[320px] resize-none"
                  placeholder="# Heading…"
                />
                <div className="rounded-md border border-border bg-muted/20 p-3 overflow-y-auto thin-scroll min-h-[320px] max-h-[480px]">
                  <MarkdownPreview content={content} />
                </div>
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="text-sm font-mono min-h-[320px] resize-y"
              />
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={extract}
              onChange={(e) => setExtract(e.target.checked)}
              className="rounded"
            />
            Re-extract decisions with LLM after saving (best-effort)
          </label>
        </div>

        <DialogFooter className="p-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4 mr-1" />
                Save changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

