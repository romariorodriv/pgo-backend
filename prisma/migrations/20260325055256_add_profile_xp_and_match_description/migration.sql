-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "experience_points" INTEGER NOT NULL DEFAULT 0;
