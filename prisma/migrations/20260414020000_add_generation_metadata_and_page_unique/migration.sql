-- Add generationMetadata column to Project for novel resume support
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "generationMetadata" TEXT;

-- Add unique constraint on (projectId, pageOrder) to Page for upsert support
ALTER TABLE "Page" ADD CONSTRAINT "Page_projectId_pageOrder_key" UNIQUE ("projectId", "pageOrder");
