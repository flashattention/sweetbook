-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "storyCharacters" TEXT,
    "requestedPageCount" INTEGER,
    "generationStage" TEXT,
    "generationProgress" INTEGER,
    "generationError" TEXT,
    "generationCostUsd" REAL,
    "projectType" TEXT NOT NULL DEFAULT 'PHOTOBOOK',
    "genre" TEXT,
    "synopsis" TEXT,
    "comicStyle" TEXT,
    "bookSpecUid" TEXT NOT NULL DEFAULT 'SQUAREBOOK_HC',
    "coverTemplateUid" TEXT,
    "contentTemplateUid" TEXT,
    "coverTemplateOverrides" TEXT,
    "contentTemplateOverrides" TEXT,
    "coverImageUrl" TEXT,
    "coverCaption" TEXT DEFAULT '',
    "bookUid" TEXT,
    "orderUid" TEXT,
    "orderStatus" TEXT,
    "trackingInfo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("bookSpecUid", "bookUid", "contentTemplateUid", "coverCaption", "coverImageUrl", "coverTemplateUid", "createdAt", "id", "orderStatus", "orderUid", "status", "title", "trackingInfo", "updatedAt") SELECT "bookSpecUid", "bookUid", "contentTemplateUid", "coverCaption", "coverImageUrl", "coverTemplateUid", "createdAt", "id", "orderStatus", "orderUid", "status", "title", "trackingInfo", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
