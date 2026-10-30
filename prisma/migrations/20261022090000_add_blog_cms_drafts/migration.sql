CREATE TABLE "BlogArticle" (
 "id" UUID NOT NULL,
 "slug" VARCHAR(160) NOT NULL,
 "title" VARCHAR(220) NOT NULL,
 "excerpt" TEXT NOT NULL DEFAULT '',
 "contentHtml" TEXT NOT NULL DEFAULT '',
 "category" VARCHAR(100) NOT NULL DEFAULT 'Consejos de pádel',
 "seoTitle" VARCHAR(220) NOT NULL DEFAULT '',
 "seoDescription" VARCHAR(500) NOT NULL DEFAULT '',
 "primaryKeyword" VARCHAR(140) NOT NULL DEFAULT '',
 "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
 "createdByAdminId" UUID,
 "updatedByAdminId" UUID,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "deletedAt" TIMESTAMP(3),
 CONSTRAINT "BlogArticle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogArticle_slug_key" ON "BlogArticle"("slug");
CREATE INDEX "BlogArticle_status_updatedAt_idx" ON "BlogArticle"("status", "updatedAt");
