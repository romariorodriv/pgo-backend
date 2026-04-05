DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TournamentMatchStatus') THEN
        CREATE TYPE "TournamentMatchStatus" AS ENUM ('PENDING', 'LIVE', 'FINISHED');
    END IF;
END $$;

CREATE TABLE "tournament_matches" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "match_number" INTEGER NOT NULL,
    "court_label" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "team_one_label" TEXT NOT NULL,
    "team_two_label" TEXT NOT NULL,
    "winner_label" TEXT,
    "status" "TournamentMatchStatus" NOT NULL DEFAULT 'PENDING',
    "score" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tournament_matches_tournament_id_stage_match_number_key"
ON "tournament_matches"("tournament_id", "stage", "match_number");

ALTER TABLE "tournament_matches"
ADD CONSTRAINT "tournament_matches_tournament_id_fkey"
FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
