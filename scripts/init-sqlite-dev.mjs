import { mkdirSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

const dbPath = resolveSqliteDatabasePath(process.env.DATABASE_URL || "file:./db/custom.db")
mkdirSync(dirname(dbPath), { recursive: true })

const db = new DatabaseSync(dbPath)
db.exec("PRAGMA foreign_keys = ON;")

db.exec(`
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user',
  "emailVerifiedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "AuthSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

CREATE TABLE IF NOT EXISTS "Note" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL DEFAULT 'local-user',
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sourcePath" TEXT NOT NULL,
  "project" TEXT NOT NULL DEFAULT 'general',
  "tags" TEXT NOT NULL DEFAULT '',
  "contentHash" TEXT NOT NULL,
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Note_project_idx" ON "Note"("project");
CREATE INDEX IF NOT EXISTS "Note_createdAt_idx" ON "Note"("createdAt");
CREATE INDEX IF NOT EXISTS "Note_pinned_idx" ON "Note"("pinned");

CREATE TABLE IF NOT EXISTS "Chunk" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL DEFAULT 'local-user',
  "noteId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "headingPath" TEXT NOT NULL DEFAULT '',
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "termFreq" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Chunk_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Chunk_noteId_chunkIndex_key" ON "Chunk"("noteId", "chunkIndex");

CREATE TABLE IF NOT EXISTS "Decision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL DEFAULT 'local-user',
  "noteId" TEXT NOT NULL,
  "chunkId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "decisionDate" TEXT NOT NULL DEFAULT '',
  "rationale" TEXT NOT NULL,
  "alternatives" TEXT NOT NULL DEFAULT '',
  "outcome" TEXT NOT NULL DEFAULT '',
  "participants" TEXT NOT NULL DEFAULT '',
  "project" TEXT NOT NULL DEFAULT 'general',
  "confidence" REAL NOT NULL DEFAULT 0.8,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Decision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Decision_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Decision_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "Chunk" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Decision_project_idx" ON "Decision"("project");
CREATE INDEX IF NOT EXISTS "Decision_decisionDate_idx" ON "Decision"("decisionDate");
CREATE INDEX IF NOT EXISTS "Decision_pinned_idx" ON "Decision"("pinned");

CREATE TABLE IF NOT EXISTS "ChatSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL DEFAULT 'local-user',
  "title" TEXT NOT NULL DEFAULT 'New chat',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL DEFAULT 'local-user',
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "citations" TEXT NOT NULL DEFAULT '[]',
  "emailDraft" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

CREATE TABLE IF NOT EXISTS "Email" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL DEFAULT 'local-user',
  "toAddress" TEXT NOT NULL,
  "fromName" TEXT NOT NULL DEFAULT 'Memex',
  "subject" TEXT NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "sourceId" TEXT NOT NULL DEFAULT '',
  "errorMessage" TEXT NOT NULL DEFAULT '',
  "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduledFor" DATETIME,
  "sentAt" DATETIME,
  "deliveredAt" DATETIME,
  "deliveryMode" TEXT NOT NULL DEFAULT 'unknown',
  "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" DATETIME,
  CONSTRAINT "Email_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Email_status_idx" ON "Email"("status");
CREATE INDEX IF NOT EXISTS "Email_sourceType_idx" ON "Email"("sourceType");
CREATE INDEX IF NOT EXISTS "Email_queuedAt_idx" ON "Email"("queuedAt");
CREATE INDEX IF NOT EXISTS "Email_scheduledFor_idx" ON "Email"("scheduledFor");
CREATE INDEX IF NOT EXISTS "Email_isAiGenerated_idx" ON "Email"("isAiGenerated");

CREATE TABLE IF NOT EXISTS "EmailTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL DEFAULT 'local-user',
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "EmailTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "EmailAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL DEFAULT 'local-user',
  "emailAddress" TEXT NOT NULL,
  "displayName" TEXT NOT NULL DEFAULT '',
  "imapHost" TEXT NOT NULL DEFAULT '',
  "imapPort" INTEGER NOT NULL DEFAULT 993,
  "imapUser" TEXT NOT NULL DEFAULT '',
  "imapSecure" BOOLEAN NOT NULL DEFAULT true,
  "imapPassword" TEXT NOT NULL DEFAULT '',
  "smtpHost" TEXT NOT NULL DEFAULT '',
  "smtpPort" INTEGER NOT NULL DEFAULT 587,
  "smtpUser" TEXT NOT NULL DEFAULT '',
  "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
  "smtpPassword" TEXT NOT NULL DEFAULT '',
  "provider" TEXT NOT NULL DEFAULT 'manual',
  "oauthAccessToken" TEXT NOT NULL DEFAULT '',
  "oauthRefreshToken" TEXT NOT NULL DEFAULT '',
  "oauthTokenExpiresAt" DATETIME,
  "oauthScopes" TEXT NOT NULL DEFAULT '',
  "connected" BOOLEAN NOT NULL DEFAULT false,
  "lastSyncAt" DATETIME,
  "syncMode" TEXT NOT NULL DEFAULT 'demo',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "InboxEmail" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL DEFAULT 'local-user',
  "accountId" TEXT NOT NULL DEFAULT '',
  "fromAddress" TEXT NOT NULL,
  "fromName" TEXT NOT NULL DEFAULT '',
  "toAddress" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT 'normal',
  "action" TEXT NOT NULL DEFAULT 'review',
  "summary" TEXT NOT NULL DEFAULT '',
  "keyPoints" TEXT NOT NULL DEFAULT '[]',
  "suggestedReply" TEXT NOT NULL DEFAULT '',
  "analyzed" BOOLEAN NOT NULL DEFAULT false,
  "analysisState" TEXT NOT NULL DEFAULT 'pending',
  "triageScore" INTEGER NOT NULL DEFAULT 0,
  "threadId" TEXT NOT NULL DEFAULT '',
  "providerMessageId" TEXT NOT NULL DEFAULT '',
  "inReplyTo" TEXT NOT NULL DEFAULT '',
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "isStarred" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboxEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "InboxEmail_category_idx" ON "InboxEmail"("category");
CREATE INDEX IF NOT EXISTS "InboxEmail_action_idx" ON "InboxEmail"("action");
CREATE INDEX IF NOT EXISTS "InboxEmail_isRead_idx" ON "InboxEmail"("isRead");
CREATE INDEX IF NOT EXISTS "InboxEmail_receivedAt_idx" ON "InboxEmail"("receivedAt");
CREATE INDEX IF NOT EXISTS "InboxEmail_threadId_idx" ON "InboxEmail"("threadId");

CREATE TABLE IF NOT EXISTS "EmailAnalysisJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "emailId" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'metadata',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" DATETIME,
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "EmailAnalysisJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Profile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL DEFAULT 'local-user',
  "email" TEXT NOT NULL DEFAULT 'you@memex.local',
  "name" TEXT NOT NULL DEFAULT 'Memex User',
  "smtpHost" TEXT NOT NULL DEFAULT 'smtp.memex.local',
  "smtpPort" INTEGER NOT NULL DEFAULT 587,
  "smtpUser" TEXT NOT NULL DEFAULT '',
  "dailyDigest" BOOLEAN NOT NULL DEFAULT true,
  "digestHour" INTEGER NOT NULL DEFAULT 9,
  "dataEncryption" BOOLEAN NOT NULL DEFAULT true,
  "llmPrivacyMode" BOOLEAN NOT NULL DEFAULT true,
  "autoDeleteDays" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
`)

db.prepare(`
  INSERT OR IGNORE INTO "User" ("id", "email", "name", "passwordHash", "role", "updatedAt")
  VALUES ('local-user', 'local-user@memex.local', 'Memex User', 'disabled:local-bootstrap-user', 'user', CURRENT_TIMESTAMP)
`).run()

ensureColumn("User", "emailVerifiedAt", "DATETIME")

for (const table of [
  "Note",
  "Chunk",
  "Decision",
  "ChatSession",
  "ChatMessage",
  "Email",
  "EmailTemplate",
  "EmailAccount",
  "InboxEmail",
  "Profile",
]) {
  ensureColumn(table, "userId", "TEXT NOT NULL DEFAULT 'local-user'")
  db.prepare(`UPDATE "${table}" SET "userId" = 'local-user' WHERE "userId" IS NULL OR "userId" = ''`).run()
}
ensureColumn("RateLimitBucket", "userId", "TEXT")
ensureColumn("Email", "deliveryMode", "TEXT NOT NULL DEFAULT 'unknown'")
ensureColumn("InboxEmail", "providerMessageId", "TEXT NOT NULL DEFAULT ''")
ensureColumn("InboxEmail", "analysisState", "TEXT NOT NULL DEFAULT 'pending'")
ensureColumn("InboxEmail", "triageScore", "INTEGER NOT NULL DEFAULT 0")
ensureColumn("EmailAccount", "provider", "TEXT NOT NULL DEFAULT 'manual'")
ensureColumn("EmailAccount", "oauthAccessToken", "TEXT NOT NULL DEFAULT ''")
ensureColumn("EmailAccount", "oauthRefreshToken", "TEXT NOT NULL DEFAULT ''")
ensureColumn("EmailAccount", "oauthTokenExpiresAt", "DATETIME")
ensureColumn("EmailAccount", "oauthScopes", "TEXT NOT NULL DEFAULT ''")

db.exec(`
CREATE INDEX IF NOT EXISTS "InboxEmail_analysisState_idx" ON "InboxEmail"("analysisState");
CREATE INDEX IF NOT EXISTS "InboxEmail_triageScore_idx" ON "InboxEmail"("triageScore");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailAnalysisJob_emailId_key" ON "EmailAnalysisJob"("emailId");
CREATE INDEX IF NOT EXISTS "EmailAnalysisJob_status_runAfter_idx" ON "EmailAnalysisJob"("status", "runAfter");
CREATE INDEX IF NOT EXISTS "EmailAnalysisJob_userId_status_idx" ON "EmailAnalysisJob"("userId", "status");
CREATE INDEX IF NOT EXISTS "EmailAnalysisJob_priority_runAfter_idx" ON "EmailAnalysisJob"("priority", "runAfter");
`)

db.exec(`
DROP INDEX IF EXISTS "Note_sourcePath_key";
DROP INDEX IF EXISTS "EmailTemplate_name_key";
DROP INDEX IF EXISTS "EmailAccount_emailAddress_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Note_userId_sourcePath_key" ON "Note"("userId", "sourcePath");
CREATE INDEX IF NOT EXISTS "Note_userId_idx" ON "Note"("userId");
CREATE INDEX IF NOT EXISTS "Chunk_userId_idx" ON "Chunk"("userId");
CREATE INDEX IF NOT EXISTS "Chunk_noteId_idx" ON "Chunk"("noteId");
CREATE INDEX IF NOT EXISTS "Decision_userId_idx" ON "Decision"("userId");
CREATE INDEX IF NOT EXISTS "ChatSession_userId_idx" ON "ChatSession"("userId");
CREATE INDEX IF NOT EXISTS "ChatMessage_userId_idx" ON "ChatMessage"("userId");
CREATE INDEX IF NOT EXISTS "Email_userId_idx" ON "Email"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_userId_name_key" ON "EmailTemplate"("userId", "name");
CREATE INDEX IF NOT EXISTS "EmailTemplate_userId_idx" ON "EmailTemplate"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailAccount_userId_emailAddress_key" ON "EmailAccount"("userId", "emailAddress");
CREATE INDEX IF NOT EXISTS "EmailAccount_userId_idx" ON "EmailAccount"("userId");
CREATE INDEX IF NOT EXISTS "InboxEmail_userId_idx" ON "InboxEmail"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Profile_userId_key" ON "Profile"("userId");
CREATE INDEX IF NOT EXISTS "RateLimitBucket_userId_idx" ON "RateLimitBucket"("userId");
`)

const existingProfile = db.prepare('SELECT COUNT(*) AS count FROM "Profile" WHERE "id" = ?').get("me")
if (existingProfile.count === 0) {
  db.prepare(`
    INSERT INTO "Profile" ("id", "userId", "email", "name", "smtpHost", "smtpPort", "smtpUser", "dailyDigest", "digestHour", "dataEncryption", "llmPrivacyMode", "autoDeleteDays", "updatedAt")
    VALUES ('me', 'local-user', 'you@memex.local', 'Memex User', 'smtp.memex.local', 587, '', true, 9, true, true, 0, CURRENT_TIMESTAMP)
  `).run()
}

db.close()
console.log(`Initialized SQLite database at ${dbPath}`)

function resolveSqliteDatabasePath(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("db:init-sqlite requires DATABASE_URL to use a file: SQLite URL")
  }

  const sqlitePath = databaseUrl.slice("file:".length)
  if (isAbsolute(sqlitePath) || /^[A-Za-z]:[\\/]/.test(sqlitePath)) {
    return resolve(sqlitePath)
  }

  return resolve("prisma", sqlitePath)
}

function ensureColumn(table, column, definition) {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all()
  const exists = rows.some((row) => row.name === column)
  if (!exists) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`)
  }
}
