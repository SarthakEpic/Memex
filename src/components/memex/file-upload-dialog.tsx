"use client"

import { useState, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  FileText,
  FileUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  File,
} from "lucide-react"
import { toast } from "sonner"

interface FileUploadDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
}

const SUPPORTED_FORMATS = [
  { ext: "PDF", desc: "Portable Document Format", icon: FileText },
  { ext: "DOCX", desc: "Microsoft Word", icon: FileText },
  { ext: "PPTX", desc: "Microsoft PowerPoint", icon: FileText },
  { ext: "TXT", desc: "Plain text", icon: FileText },
  { ext: "MD", desc: "Markdown", icon: FileText },
]

export function FileUploadDialog({ open, onOpenChange }: FileUploadDialogProps) {
  const [project, setProject] = useState("imported")
  const [tags, setTags] = useState("")
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setSelectedFile(null)
    setProject("imported")
    setTags("")
  }

  const handleFileSelect = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!["pdf", "docx", "pptx", "txt", "md", "markdown"].includes(ext || "")) {
      toast.error(`Unsupported format: .${ext}`, {
        description: "Supported: PDF, DOCX, PPTX, TXT, MD",
      })
      return
    }
    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)

    try {
      // Read file as base64
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(",")[1]
        try {
          const r = await fetch("/api/notes/upload-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: selectedFile.name,
              fileType: selectedFile.type,
              fileBase64: base64,
              project: project.trim() || "imported",
              tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
              extractDecisions: true,
            }),
          })
          const d = await r.json()
          if (!r.ok) throw new Error(d.error || "Upload failed")
          toast.success(d.message || "File imported")
          reset()
          onOpenChange(false)
          window.dispatchEvent(new CustomEvent("memex-notes-updated"))
        } catch (e: any) {
          toast.error(e.message || "Upload failed")
        } finally {
          setUploading(false)
        }
      }
      reader.readAsDataURL(selectedFile)
    } catch (e: any) {
      toast.error(e.message || "Upload failed")
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" />
            Upload File
          </DialogTitle>
          <DialogDescription>
            Import a document and AI will extract text, structure it, and create
            a searchable note with decision extraction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Supported formats */}
          <div className="flex flex-wrap gap-1.5">
            {SUPPORTED_FORMATS.map((f) => (
              <Badge key={f.ext} variant="outline" className="text-[10px] gap-1">
                <f.icon className="h-2.5 w-2.5" />
                {f.ext}
              </Badge>
            ))}
          </div>

          {/* Drag & drop area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleFileSelect(file)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-accent/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md,.markdown"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file)
              }}
            />
            {selectedFile ? (
              <div className="space-y-1">
                <File className="h-8 w-8 text-primary mx-auto" />
                <div className="text-sm font-medium">{selectedFile.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB · Click to change
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <div className="text-sm font-medium">Drop file here or click to browse</div>
                <div className="text-[10px] text-muted-foreground">
                  PDF, Word, PowerPoint, TXT, Markdown
                </div>
              </div>
            )}
          </div>

          {/* Project + Tags */}
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
                placeholder="doc, report"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1" />
                Import file
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
