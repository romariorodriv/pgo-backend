BEGIN;

-- Additive migration. No deletion of clubs, reservations or configuration.
ALTER TABLE "clubs"
  ADD COLUMN "is_published" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legacy_access" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trial_started_at" TIMESTAMP(3),
  ADD COLUMN "trial_ends_at" TIMESTAMP(3);

-- Preserve operation for clubs already approved, including suspended clubs
-- that may be reinstated. Administrative suspension still overrides access.
UPDATE "clubs" SET "is_published" = true, "legacy_access" = true
WHERE "status" IN ('APPROVED', 'SUSPENDED');

ALTER TABLE "clubs" ADD CONSTRAINT "clubs_trial_window_check" CHECK (
  ("trial_started_at" IS NULL AND "trial_ends_at" IS NULL) OR
  ("trial_started_at" IS NOT NULL AND "trial_ends_at" IS NOT NULL
   AND "trial_ends_at" = "trial_started_at" + INTERVAL '168 hours')
);
CREATE INDEX "clubs_trial_publication_idx" ON "clubs" ("status", "is_published", "trial_ends_at");

COMMIT;
