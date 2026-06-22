"use client"

import { useState, useRef, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Mic,
  Square,
  Loader2,
  MicOff,
  CheckCircle2,
  AlertCircle,
  Languages,
  FileText,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { MarkdownPreview } from "./markdown-preview"

interface AudioNoteDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
}

type RecordingState = "idle" | "recording" | "recorded" | "transcribing" | "structuring" | "done"

export function AudioNoteDialog({ open, onOpenChange }: AudioNoteDialogProps) {
  const [state, setState] = useState<RecordingState>("idle")
  const [language, setLanguage] = useState<"auto" | "en" | "hi">("auto")
  const [project, setProject] = useState("voice")
  const [tags, setTags] = useState("")
  const [audioBase64, setAudioBase64] = useState<string>("")
  const [recordingTime, setRecordingTime] = useState(0)
  const [rawTranscription, setRawTranscription] = useState("")
  const [structuredContent, setStructuredContent] = useState("")
  const [detectedLanguage, setDetectedLanguage] = useState("")
  const [error, setError] = useState("")

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setState("idle")
      setAudioBase64("")
      setRawTranscription("")
      setStructuredContent("")
      setDetectedLanguage("")
      setError("")
      setRecordingTime(0)
    }
  }, [open])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording()
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  const startRecording = async () => {
    setError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        // Convert to base64
        const reader = new FileReader()
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1]
          setAudioBase64(base64)
          setState("recorded")
        }
        reader.readAsDataURL(blob)

        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop())
      }

      mediaRecorder.start()
      setState("recording")
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)
    } catch (err: any) {
      setError(
        "Could not access microphone. Please allow microphone permissions and try again."
      )
      toast.error("Microphone access denied")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const processAudio = async () => {
    if (!audioBase64) return
    setState("transcribing")
    setError("")

    try {
      const r = await fetch("/api/notes/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: audioBase64,
          language,
          project: project.trim() || "voice",
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          extractDecisions: true,
        }),
      })

      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Processing failed")

      setRawTranscription(d.rawTranscription)
      setStructuredContent(d.structuredContent)
      setDetectedLanguage(d.language)
      setState("done")
      toast.success(d.message || "Voice note created")
    } catch (e: any) {
      setError(e.message || "Failed to process audio")
      setState("recorded")
      toast.error(e.message || "Processing failed")
    }
  }

  const handleSaveAndClose = () => {
    onOpenChange(false)
    // Trigger a page reload of queries via custom event
    window.dispatchEvent(new CustomEvent("memex-notes-updated"))
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            Audio to Note
          </DialogTitle>
          <DialogDescription>
            Speak in English or Hindi. AI will transcribe, structure, and organize
            your voice into a clean Markdown note. Hindi speech becomes Hinglish.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-4">
          {/* Language selector */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Languages className="h-3 w-3" />
              Language
            </Label>
            <div className="flex gap-2">
              {([
                { id: "auto", label: "Auto-detect" },
                { id: "en", label: "English" },
                { id: "hi", label: "हिंदी (Hindi → Hinglish)" },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setLanguage(opt.id)}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    language === opt.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project + Tags */}
          {state === "idle" && (
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
                  placeholder="meeting, idea"
                  className="text-sm"
                />
              </div>
            </div>
          )}

          {/* Recording area */}
          {state === "idle" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <button
                onClick={startRecording}
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors group"
              >
                <Mic className="h-8 w-8" />
                <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-20 group-hover:opacity-40" />
              </button>
              <p className="text-sm text-muted-foreground">
                Click the microphone to start recording
              </p>
            </div>
          )}

          {state === "recording" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <button
                onClick={stopRecording}
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                <Square className="h-7 w-7 fill-white" />
                <span className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-30" />
              </button>
              <div className="text-center space-y-1">
                <div className="text-2xl font-mono font-semibold tabular-nums text-red-500">
                  {formatTime(recordingTime)}
                </div>
                <p className="text-sm text-muted-foreground">Recording... Click to stop</p>
              </div>
            </div>
          )}

          {state === "recorded" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">
                  Recorded {formatTime(recordingTime)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setState("idle"); setAudioBase64("") }}>
                  Re-record
                </Button>
                <Button size="sm" onClick={processAudio}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Transcribe & Structure
                </Button>
              </div>
            </div>
          )}

          {(state === "transcribing" || state === "structuring") && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  {state === "transcribing" ? "Transcribing audio..." : "Structuring note..."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {state === "transcribing"
                    ? "Converting your speech to text"
                    : "AI is organizing and formatting your note"}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {state === "done" && (
            <div className="space-y-4">
              {/* Language badge */}
              <div className="flex items-center gap-2">
                <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {detectedLanguage === "hinglish" ? "Hinglish" : "English"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Transcribed and structured by AI
                </span>
              </div>

              {/* Structured note preview */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <FileText className="h-3 w-3" />
                  Structured Note (preview)
                </Label>
                <div className="rounded-md border border-border bg-muted/20 p-3 max-h-[300px] overflow-y-auto thin-scroll">
                  <MarkdownPreview content={structuredContent} />
                </div>
              </div>

              {/* Raw transcription (collapsible) */}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Show raw transcription
                </summary>
                <div className="mt-2 rounded-md border border-border p-2.5 bg-muted/10 text-muted-foreground font-mono whitespace-pre-wrap">
                  {rawTranscription}
                </div>
              </details>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border">
          {state === "done" ? (
            <Button onClick={handleSaveAndClose}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Done
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
