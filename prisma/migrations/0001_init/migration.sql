CREATE TABLE "Note" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sourcePath" TEXT NOT NULL,
  "project" TEXT NOT NULL DEFAULT 'general',
  "tags" TEXT NOT NULL DEFAULT '',
  "contentHash" TEXT NOT NULL,
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Note_sourcePath_key" ON "Note"("sourcePath");
CREATE INDEX "Note_project_idx" ON "Note"("project");
CREATE INDEX "Note_createdAt_idx" ON "Note"("createdAt");
CREATE INDEX "Note_pinned_idx" ON "Note"("pinned");

CREATE TABLE "Chunk" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "noteId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "headingPath" TEXT NOT NULL DEFAULT '',
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "termFreq" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chunk_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Chunk_noteId_chunkIndex_key" ON "Chunk"("noteId", "chunkIndex");
CREATE INDEX "Chunk_noteId_idx" ON "Chunk"("noteId");

CREATE TABLE "Decision" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  CONSTRAINT "Decision_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Decision_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "Chunk" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Decision_project_idx" ON "Decision"("project");
CREATE INDEX "Decision_decisionDate_idx" ON "Decision"("decisionDate");
CREATE INDEX "Decision_pinned_idx" ON "Decision"("pinned");

CREATE TABLE "ChatSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL DEFAULT 'New chat',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "citations" TEXT NOT NULL DEFAULT '[]',
  "emailDraft" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

CREATE TABLE "Email" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" DATETIME
);

CREATE INDEX "Email_status_idx" ON "Email"("status");
CREATE INDEX "Email_sourceType_idx" ON "Email"("sourceType");
CREATE INDEX "Email_queuedAt_idx" ON "Email"("queuedAt");
CREATE INDEX "Email_scheduledFor_idx" ON "Email"("scheduledFor");
CREATE INDEX "Email_isAiGenerated_idx" ON "Email"("isAiGenerated");

CREATE TABLE "EmailTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "EmailTemplate_name_key" ON "EmailTemplate"("name");

CREATE TABLE "EmailAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "connected" BOOLEAN NOT NULL DEFAULT false,
  "lastSyncAt" DATETIME,
  "syncMode" TEXT NOT NULL DEFAULT 'demo',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "EmailAccount_emailAddress_key" ON "EmailAccount"("emailAddress");

CREATE TABLE "InboxEmail" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "threadId" TEXT NOT NULL DEFAULT '',
  "inReplyTo" TEXT NOT NULL DEFAULT '',
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "isStarred" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "InboxEmail_category_idx" ON "InboxEmail"("category");
CREATE INDEX "InboxEmail_action_idx" ON "InboxEmail"("action");
CREATE INDEX "InboxEmail_isRead_idx" ON "InboxEmail"("isRead");
CREATE INDEX "InboxEmail_receivedAt_idx" ON "InboxEmail"("receivedAt");
CREATE INDEX "InboxEmail_threadId_idx" ON "InboxEmail"("threadId");

CREATE TABLE "Profile" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'me',
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
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 0,
  "resetAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
