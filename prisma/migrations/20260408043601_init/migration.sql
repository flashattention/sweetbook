-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "coupleNameA" TEXT NOT NULL,
    "coupleNameB" TEXT NOT NULL,
    "anniversaryDate" DATETIME NOT NULL,
    "bookSpecUid" TEXT NOT NULL DEFAULT 'SQUAREBOOK_HC',
    "coverTemplateUid" TEXT,
    "contentTemplateUid" TEXT,
    "coverImageUrl" TEXT,
    "coverCaption" TEXT DEFAULT '',
    "bookUid" TEXT,
    "orderUid" TEXT,
    "orderStatus" TEXT,
    "trackingInfo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "pageOrder" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Page_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Page_projectId_idx" ON "Page"("projectId");
