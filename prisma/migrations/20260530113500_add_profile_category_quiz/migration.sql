ALTER TABLE "profiles"
ADD COLUMN IF NOT EXISTS "category_suggested" TEXT,
ADD COLUMN IF NOT EXISTS "category_preliminary" TEXT,
ADD COLUMN IF NOT EXISTS "category_max_applied" TEXT,
ADD COLUMN IF NOT EXISTS "category_score" INTEGER,
ADD COLUMN IF NOT EXISTS "category_quiz_answers" JSONB,
ADD COLUMN IF NOT EXISTS "category_is_provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "category_origin" TEXT;
