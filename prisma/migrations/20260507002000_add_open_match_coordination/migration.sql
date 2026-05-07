CREATE TYPE "OpenMatchCoordinationStatus" AS ENUM ('ARRIVED', 'ON_THE_WAY', 'ARRIVING_10', 'CANNOT_GO');

CREATE TABLE "open_match_coordination_updates" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "OpenMatchCoordinationStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "open_match_coordination_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "open_match_coordination_updates_alert_id_created_at_idx" ON "open_match_coordination_updates"("alert_id", "created_at");
CREATE INDEX "open_match_coordination_updates_user_id_idx" ON "open_match_coordination_updates"("user_id");

ALTER TABLE "open_match_coordination_updates" ADD CONSTRAINT "open_match_coordination_updates_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "open_match_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "open_match_coordination_updates" ADD CONSTRAINT "open_match_coordination_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
