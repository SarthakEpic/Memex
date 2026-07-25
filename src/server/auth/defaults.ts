import { db } from "@/lib/db"

const DEFAULT_TEMPLATES = [
  {
    name: "Daily Digest",
    type: "digest",
    subject: "Memex Daily Digest",
    bodyMarkdown:
      "# Memex Daily Digest\n\nGenerated {{date}}\n\n## Recent Decisions\n{{decisions}}\n\n## Recent Questions\n{{questions}}\n",
  },
  {
    name: "Decision Brief",
    type: "brief",
    subject: "Decision: {{title}}",
    bodyMarkdown:
      "# {{title}}\n\n**Decided:** {{date}}\n\n**Rationale:** {{rationale}}\n\n**Alternatives:** {{alternatives}}\n\n_Source: {{source}}_\n",
  },
  {
    name: "Source Snapshot",
    type: "snapshot",
    subject: "Source: {{sourcePath}}",
    bodyMarkdown:
      "# {{sourcePath}}\n\n{{chunkText}}\n\n---\nSent from Memex citation-first knowledge retrieval.\n",
  },
]

export async function ensureUserWorkspace(user: {
  id: string
  email: string
  name: string
}): Promise<void> {
  await db.profile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      email: user.email,
      name: user.name || "Memex User",
      smtpHost: "smtp.memex.local",
      smtpPort: 587,
      smtpUser: "",
      dailyDigest: true,
      digestHour: 9,
      dataEncryption: true,
      llmPrivacyMode: true,
      autoDeleteDays: 0,
    },
    update: {},
  })

  for (const template of DEFAULT_TEMPLATES) {
    await db.emailTemplate.upsert({
      where: {
        userId_name: {
          userId: user.id,
          name: template.name,
        },
      },
      create: {
        userId: user.id,
        ...template,
      },
      update: {},
    })
  }
}
