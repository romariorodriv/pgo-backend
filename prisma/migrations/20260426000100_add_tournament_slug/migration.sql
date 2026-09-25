ALTER TABLE "tournaments" ADD COLUMN "slug" TEXT;

WITH slugged AS (
  SELECT
    "id",
    COALESCE(
      NULLIF(
        TRIM(BOTH '-' FROM REGEXP_REPLACE(
          LOWER("title"),
          '[^a-z0-9]+',
          '-',
          'g'
        )),
        ''
      ),
      'torneo'
    ) AS base_slug
  FROM "tournaments"
),
ranked AS (
  SELECT
    "id",
    base_slug,
    ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY "created_at", "id") AS slug_rank
  FROM slugged
)
UPDATE "tournaments"
SET "slug" = ranked.base_slug || CASE WHEN ranked.slug_rank = 1 THEN '' ELSE '-' || ranked.slug_rank::TEXT END
FROM ranked
WHERE "tournaments"."id" = ranked."id";

CREATE UNIQUE INDEX "tournaments_slug_key" ON "tournaments"("slug");
