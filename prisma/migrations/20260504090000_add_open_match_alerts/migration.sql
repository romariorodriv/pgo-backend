CREATE TYPE "OpenMatchAlertStatus" AS ENUM ('OPEN', 'FULL', 'CANCELED');

CREATE TABLE "open_match_alerts" (
    "id" TEXT NOT NULL,
    "organizer_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "club" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "court_status" TEXT NOT NULL,
    "missing_players" INTEGER NOT NULL,
    "cost_per_person" INTEGER NOT NULL,
    "payment_label" TEXT NOT NULL,
    "comment" TEXT,
    "status" "OpenMatchAlertStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "open_match_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "open_match_participants" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "open_match_participants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "open_match_alerts_status_starts_at_idx" ON "open_match_alerts"("status", "starts_at");
CREATE INDEX "open_match_alerts_organizer_id_idx" ON "open_match_alerts"("organizer_id");
CREATE UNIQUE INDEX "open_match_participants_alert_id_user_id_key" ON "open_match_participants"("alert_id", "user_id");
CREATE INDEX "open_match_participants_user_id_idx" ON "open_match_participants"("user_id");

ALTER TABLE "open_match_alerts" ADD CONSTRAINT "open_match_alerts_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "open_match_participants" ADD CONSTRAINT "open_match_participants_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "open_match_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "open_match_participants" ADD CONSTRAINT "open_match_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
