-- AlterTable
ALTER TABLE "tournaments"
ADD COLUMN     "tournament_type" TEXT NOT NULL DEFAULT 'Americano',
ADD COLUMN     "modality" TEXT NOT NULL DEFAULT 'Masculino',
ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'Dobles',
ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT NOT NULL DEFAULT 'Lima',
ADD COLUMN     "district" TEXT NOT NULL DEFAULT 'Santiago de Surco',
ADD COLUMN     "photo_url" TEXT;

-- Prisma previously stored prize as INTEGER; the new flow uses a text description.
ALTER TABLE "tournaments"
ALTER COLUMN "prize" TYPE TEXT USING "prize"::TEXT;
