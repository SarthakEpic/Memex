ALTER TABLE "Email" ADD COLUMN "accountId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Email" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Email" ADD COLUMN "confirmedAt" DATETIME;

CREATE INDEX "Email_userId_accountId_idx" ON "Email"("userId", "accountId");
CREATE UNIQUE INDEX "Email_userId_idempotencyKey_key" ON "Email"("userId", "idempotencyKey");
