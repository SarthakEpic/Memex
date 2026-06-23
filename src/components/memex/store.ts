"use client"

import { create } from "zustand"
import type { Section, Citation, EmailData } from "./types"

interface EmailDraft {
  toAddress: string
  subject: string
  bodyMarkdown: string
  sourceType: "manual" | "chat" | "decision" | "note" | "digest"
  sourceId: string
}

interface MemexState {
  // Navigation
  section: Section
  setSection: (s: Section) => void

  // Source panel (chunk viewer)
  sourceChunkId: string | null
  openSource: (chunkId: string) => void
  closeSource: () => void

  // Email composer
  emailDraft: EmailDraft | null
  openEmailComposer: (draft?: Partial<EmailDraft>) => void
  closeEmailComposer: () => void

  // Active chat session
  activeSessionId: string | null
  setActiveSession: (id: string | null) => void

  // Command palette
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (o: boolean) => void
  openCommandPalette: () => void

  // Toast-less inline notice (for non-blocking ops)
  notice: string | null
  setNotice: (msg: string | null) => void
}

export const useMemex = create<MemexState>((set) => ({
  section: "dashboard",
  setSection: (s) => set({ section: s }),

  sourceChunkId: null,
  openSource: (chunkId) => set({ sourceChunkId: chunkId }),
  closeSource: () => set({ sourceChunkId: null }),

  emailDraft: null,
  openEmailComposer: (draft) =>
    set({
      emailDraft: {
        toAddress: "me",
        subject: draft?.subject ?? "",
        bodyMarkdown: draft?.bodyMarkdown ?? "",
        sourceType: draft?.sourceType ?? "manual",
        sourceId: draft?.sourceId ?? "",
      },
    }),
  closeEmailComposer: () => set({ emailDraft: null }),

  activeSessionId: null,
  setActiveSession: (id) => set({ activeSessionId: id }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (o) => set({ commandPaletteOpen: o }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),

  notice: null,
  setNotice: (msg) => set({ notice: msg }),
}))
