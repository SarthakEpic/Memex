import { z } from "zod"

const idSchema = z.string().trim().min(1).max(200)
const tagSchema = z.string().trim().min(1).max(40)

export const noteUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    content: z.string().min(1).max(2_000_000).optional(),
    project: z.string().trim().min(1).max(80).optional(),
    tags: z.array(tagSchema).max(20).optional(),
    extractDecisions: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one note field is required",
  })

export const pinMutationSchema = z
  .object({
    type: z.enum(["note", "decision"]),
    id: idSchema,
  })
  .strict()

export const decisionExtractSchema = z
  .object({
    noteId: idSchema,
  })
  .strict()

export const noteBulkMutationSchema = z
  .object({
    action: z.enum(["delete", "pin", "unpin", "export"]),
    ids: z.array(idSchema).min(1).max(100),
  })
  .strict()

export const inboxUpdateSchema = z
  .object({
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    category: z.enum(["urgent", "important", "normal", "newsletter", "spam"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one inbox field is required",
  })

export const inboxReplySchema = z
  .object({
    instruction: z.string().trim().min(1).max(4_000),
  })
  .strict()

export const eraseWorkspaceSchema = z
  .object({
    confirm: z.literal("ERASE ALL DATA"),
  })
  .strict()

export const chatSessionUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
  })
  .strict()

const emailDraftCoreSchema = z
  .object({
    recipient: z.string().trim().min(1).max(320),
    subject: z.string().trim().min(1).max(240),
    bodyMarkdown: z.string().min(1).max(200_000),
    rationale: z.string().max(4_000),
  })
  .strict()

const emailTimelineEventSchema = z
  .object({
    action: z.string().trim().min(1).max(120),
    timestamp: z.string().datetime(),
    details: z.string().max(1_000).optional(),
  })
  .strict()

const persistedEmailDraftSchema = emailDraftCoreSchema
  .extend({
    status: z.enum(["draft", "sending", "saved", "sent", "failed", "scheduled", "cancelled"]),
    emailId: idSchema.optional(),
    errorMessage: z.string().max(2_000).optional(),
    scheduledFor: z.string().datetime().optional(),
    timeline: z.array(emailTimelineEventSchema).max(100),
  })
  .strict()

export const chatMessageDraftUpdateSchema = z
  .object({
    emailDraft: persistedEmailDraftSchema,
  })
  .strict()

export const emailSubjectSchema = z
  .object({
    bodyMarkdown: z.string().trim().min(1).max(200_000),
  })
  .strict()

export const emailRegenerateSchema = z
  .object({
    instruction: z.string().trim().min(1).max(4_000),
    previousDraft: emailDraftCoreSchema,
    feedback: z.string().trim().min(1).max(4_000),
  })
  .strict()

export const emailDigestSchema = z
  .object({
    force: z.boolean().optional().default(false),
  })
  .strict()

export const emailTemplateCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1).max(80).optional().default("custom"),
    subject: z.string().trim().min(1).max(240),
    bodyMarkdown: z.string().min(1).max(200_000),
  })
  .strict()

export const audioNoteSchema = z
  .object({
    audio: z.string().min(1).max(35_000_000),
    language: z.enum(["auto", "en", "hi"]).optional().default("auto"),
    project: z.string().trim().min(1).max(80).optional().default("voice"),
    tags: z.array(tagSchema).max(20).optional().default([]),
    extractDecisions: z.boolean().optional().default(true),
  })
  .strict()
