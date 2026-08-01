ALTER TABLE "EmailAccount" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "EmailAccount" ADD COLUMN "oauthAccessToken" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmailAccount" ADD COLUMN "oauthRefreshToken" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmailAccount" ADD COLUMN "oauthTokenExpiresAt" DATETIME;
ALTER TABLE "EmailAccount" ADD COLUMN "oauthScopes" TEXT NOT NULL DEFAULT '';
