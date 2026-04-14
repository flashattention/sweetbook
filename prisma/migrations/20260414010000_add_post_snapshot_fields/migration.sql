-- AlterTable: add snapshot columns to Post
ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "title"         TEXT,
  ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "genre"         TEXT,
  ADD COLUMN IF NOT EXISTS "synopsis"      TEXT,
  ADD COLUMN IF NOT EXISTS "pagesSnapshot" JSONB;
