ALTER TABLE "Session" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "Session" ADD COLUMN "templateId" TEXT;

CREATE INDEX "Session_ownerId_kind_updatedAt_idx" ON "Session"("ownerId", "kind", "updatedAt");
CREATE INDEX "Session_ownerId_kind_templateId_updatedAt_idx" ON "Session"("ownerId", "kind", "templateId", "updatedAt");
