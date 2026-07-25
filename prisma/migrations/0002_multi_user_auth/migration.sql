CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user',
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

INSERT OR IGNORE INTO "User" ("id", "email", "name", "passwordHash", "role", "updatedAt")
VALUES ('local-user', 'local-user@memex.local', 'Memex User', 'disabled:local-bootstrap-user', 'user', CURRENT_TIMESTAMP);

ALTER TABLE "Note" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';
ALTER TABLE "Chunk" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';
ALTER TABLE "Decision" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';
ALTER TABLE "ChatSession" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';
ALTER TABLE "ChatMessage" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';
ALTER TABLE "Email" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';
ALTER TABLE "EmailTemplate" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';
ALTER TABLE "EmailAccount" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';
ALTER TABLE "InboxEmail" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';
ALTER TABLE "Profile" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';
ALTER TABLE "RateLimitBucket" ADD COLUMN "userId" TEXT;

DROP INDEX IF EXISTS "Note_sourcePath_key";
DROP INDEX IF EXISTS "EmailTemplate_name_key";
DROP INDEX IF EXISTS "EmailAccount_emailAddress_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Note_userId_sourcePath_key" ON "Note"("userId", "sourcePath");
CREATE INDEX IF NOT EXISTS "Note_userId_idx" ON "Note"("userId");
CREATE INDEX IF NOT EXISTS "Chunk_userId_idx" ON "Chunk"("userId");
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
