import { z } from "zod"

const tagSchema = z.string().trim().min(1).max(40)
const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase())

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  password: z.string().min(10).max(200),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
})

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(300),
  password: z.string().min(10).max(200),
})

export const createNoteSchema = z.object({
  title: z.string().trim().max(160).optional(),
  content: z.string().min(1, "content is required").max(2_000_000),
  project: z.string().trim().min(1).max(80).optional(),
  tags: z.array(tagSchema).max(20).optional(),
  extractDecisions: z.boolean().optional().default(true),
})

export const uploadFileSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  fileType: z.string().trim().max(120).optional(),
  fileBase64: z.string().min(1),
  project: z.string().trim().min(1).max(80).optional().default("imported"),
  tags: z.array(tagSchema).max(20).optional().default([]),
  extractDecisions: z.boolean().optional().default(true),
})

export const importUrlSchema = z.object({
  url: z.string().trim().url().refine((value) => /^https?:\/\//i.test(value), {
    message: "Only http(s) URLs are supported",
  }),
  project: z.string().trim().min(1).max(80).optional(),
  tags: z.array(tagSchema).max(20).optional(),
  extractDecisions: z.boolean().optional().default(true),
})

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  sessionId: z
    .string()
    .trim()
    .min(1)
    .nullish()
    .transform((value) => value ?? undefined),
  rerank: z.boolean().optional(),
})

export const emailAccountCreateSchema = z.object({
  emailAddress: emailSchema,
  displayName: z.string().trim().min(1).max(120).optional(),
  imapPassword: z.string().min(1).max(1_000).optional(),
  smtpPassword: z.string().min(1).max(1_000).optional(),
}).strict()

export const emailAccountDeleteSchema = z.object({
  emailAddress: z.string().trim().email(),
})

export const refreshInboxSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("period"),
    range: z.enum(["day", "week", "month", "year"]),
  }).strict(),
  z.object({
    scope: z.literal("count"),
    count: z.union([z.literal(25), z.literal(50), z.literal(100)]),
  }).strict(),
])

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    dailyDigest: z.boolean().optional(),
    digestHour: z.number().int().min(0).max(23).optional(),
    llmPrivacyMode: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile setting is required",
  })

export const createEmailSchema = z.object({
  toAddress: z.union([z.literal("me"), emailSchema]),
  subject: z.string().trim().min(1).max(240),
  bodyMarkdown: z.string().min(1).max(200_000),
  sourceType: z.enum(["manual", "chat", "decision", "note", "digest", "ai"]).optional(),
  sourceId: z.string().trim().max(160).optional(),
  fromName: z.string().trim().max(120).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  isAiGenerated: z.boolean().optional(),
  requireVerification: z.boolean().optional(),
})

export const patchEmailSchema = z.object({
  action: z.enum(["verify", "resend", "cancel", "edit"]),
  id: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(240).optional(),
  bodyMarkdown: z.string().min(1).max(200_000).optional(),
  toAddress: z.string().trim().min(1).max(320).optional(),
})

export function validationError(error: z.ZodError): { error: string; issues: unknown } {
  return {
    error: "Invalid request body",
    issues: z.treeifyError(error),
  }
}
