ALTER TYPE "OpenMatchAlertStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

ALTER TABLE "open_match_alerts"
ADD COLUMN IF NOT EXISTS "result_match_id" TEXT,
ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "open_match_alerts_result_match_id_key"
ON "open_match_alerts"("result_match_id");

ALTER TABLE "open_match_alerts"
ADD CONSTRAINT "open_match_alerts_result_match_id_fkey"
FOREIGN KEY ("result_match_id") REFERENCES "matches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
