CREATE TYPE "TournamentRegistrationMode" AS ENUM ('SOLO', 'WITH_PARTNER');
CREATE TYPE "TournamentRegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED');

CREATE TABLE "tournament_registrations" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "partner_user_id" TEXT,
    "mode" "TournamentRegistrationMode" NOT NULL,
    "status" "TournamentRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "preferred_side" TEXT,
    "availability" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tournament_registrations_tournament_id_user_id_key" ON "tournament_registrations"("tournament_id", "user_id");
CREATE UNIQUE INDEX "tournament_registrations_tournament_id_partner_user_id_key" ON "tournament_registrations"("tournament_id", "partner_user_id");

ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_partner_user_id_fkey" FOREIGN KEY ("partner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
