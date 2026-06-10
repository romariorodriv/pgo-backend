CREATE TYPE "OpenMatchInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELED');

ALTER TABLE "users"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allow_match_invites" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "open_match_invitations" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "invitee_id" TEXT NOT NULL,
    "status" "OpenMatchInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "open_match_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "open_match_invitations_alert_id_invitee_id_key" ON "open_match_invitations"("alert_id", "invitee_id");
CREATE INDEX "open_match_invitations_invitee_id_status_idx" ON "open_match_invitations"("invitee_id", "status");
CREATE INDEX "open_match_invitations_alert_id_status_idx" ON "open_match_invitations"("alert_id", "status");

ALTER TABLE "open_match_invitations" ADD CONSTRAINT "open_match_invitations_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "open_match_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "open_match_invitations" ADD CONSTRAINT "open_match_invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
