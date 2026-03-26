-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('FRIENDLY', 'RANKED', 'TOURNAMENT');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "matchType" "MatchType" NOT NULL,
    "status" "MatchStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
