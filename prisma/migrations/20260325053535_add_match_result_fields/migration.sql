-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "games" JSONB,
ADD COLUMN     "winner_team" INTEGER;
