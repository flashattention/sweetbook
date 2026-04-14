-- AlterTable: make Post.projectId nullable and change FK to SET NULL
ALTER TABLE "Post" ALTER COLUMN "projectId" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_projectId_fkey";

-- AddForeignKey with ON DELETE SET NULL
ALTER TABLE "Post" ADD CONSTRAINT "Post_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
