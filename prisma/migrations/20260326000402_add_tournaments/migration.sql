-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "player_capacity" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "prize" INTEGER NOT NULL,
    "entry_fee" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
