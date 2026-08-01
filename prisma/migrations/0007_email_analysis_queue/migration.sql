ALTER TABLE "InboxEmail" ADD COLUMN "analysisState" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "InboxEmail" ADD COLUMN "triageScore" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "InboxEmail_analysisState_idx" ON "InboxEmail"("analysisState");
CREATE INDEX "InboxEmail_triageScore_idx" ON "InboxEmail"("triageScore");

CREATE TABLE "EmailAnalysisJob" (
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

CREATE UNIQUE INDEX "EmailAnalysisJob_emailId_key" ON "EmailAnalysisJob"("emailId");
CREATE INDEX "EmailAnalysisJob_status_runAfter_idx" ON "EmailAnalysisJob"("status", "runAfter");
CREATE INDEX "EmailAnalysisJob_userId_status_idx" ON "EmailAnalysisJob"("userId", "status");
CREATE INDEX "EmailAnalysisJob_priority_runAfter_idx" ON "EmailAnalysisJob"("priority", "runAfter");
