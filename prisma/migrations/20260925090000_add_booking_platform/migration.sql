CREATE TYPE "GlobalRole" AS ENUM ('PGO_ADMIN');
CREATE TYPE "ClubRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF');
CREATE TYPE "ClubStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "CourtStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');
CREATE TYPE "CourtBlockReason" AS ENUM ('MAINTENANCE', 'TOURNAMENT', 'EVENT', 'OTHER');
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "ReservationSource" AS ENUM ('WEB_PLAYER', 'CLUB_MANUAL', 'ADMIN', 'MOBILE');

CREATE TABLE "user_global_roles" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "role" "GlobalRole" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_global_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clubs" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL, "description" TEXT,
  "email" TEXT NOT NULL, "phone" TEXT NOT NULL, "instagram" TEXT, "logo_url" TEXT,
  "cover_image_url" TEXT, "address" TEXT NOT NULL, "district" TEXT NOT NULL, "city" TEXT NOT NULL,
  "latitude" DECIMAL(10,7), "longitude" DECIMAL(10,7), "timezone" TEXT NOT NULL DEFAULT 'America/Lima',
  "status" "ClubStatus" NOT NULL DEFAULT 'PENDING', "cancellation_hours_before" INTEGER NOT NULL DEFAULT 2,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "club_members" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "club_id" TEXT NOT NULL,
  "role" "ClubRole" NOT NULL DEFAULT 'STAFF', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "club_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "courts" (
  "id" TEXT NOT NULL, "club_id" TEXT NOT NULL, "name" TEXT NOT NULL, "sport" TEXT NOT NULL DEFAULT 'PADEL',
  "description" TEXT, "indoor" BOOLEAN NOT NULL DEFAULT false, "surface" TEXT,
  "status" "CourtStatus" NOT NULL DEFAULT 'ACTIVE', "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schedules" (
  "id" TEXT NOT NULL, "club_id" TEXT NOT NULL, "court_id" TEXT, "day_of_week" INTEGER NOT NULL,
  "open_time" TEXT NOT NULL, "close_time" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "allowed_durations" (
  "id" TEXT NOT NULL, "club_id" TEXT NOT NULL, "minutes" INTEGER NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "allowed_durations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_rules" (
  "id" TEXT NOT NULL, "club_id" TEXT NOT NULL, "court_id" TEXT, "day_of_week" INTEGER NOT NULL,
  "start_time" TEXT NOT NULL, "end_time" TEXT NOT NULL, "duration_minutes" INTEGER NOT NULL,
  "price" DECIMAL(10,2) NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "court_blocks" (
  "id" TEXT NOT NULL, "club_id" TEXT NOT NULL, "court_id" TEXT NOT NULL,
  "start_at" TIMESTAMPTZ(3) NOT NULL, "end_at" TIMESTAMPTZ(3) NOT NULL,
  "reason" "CourtBlockReason" NOT NULL, "notes" TEXT, "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "court_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "court_blocks_valid_interval" CHECK ("start_at" < "end_at")
);

CREATE TABLE "reservations" (
  "id" TEXT NOT NULL, "booking_code" TEXT NOT NULL, "club_id" TEXT NOT NULL, "court_id" TEXT NOT NULL,
  "player_id" TEXT, "created_by_user_id" TEXT NOT NULL, "guest_name" TEXT, "guest_phone" TEXT,
  "start_at" TIMESTAMPTZ(3) NOT NULL, "end_at" TIMESTAMPTZ(3) NOT NULL, "duration_minutes" INTEGER NOT NULL,
  "price" DECIMAL(10,2) NOT NULL, "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
  "source" "ReservationSource" NOT NULL, "notes" TEXT, "cancelled_at" TIMESTAMP(3),
  "cancelled_by_user_id" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservations_valid_interval" CHECK ("start_at" < "end_at")
);

CREATE INDEX "user_global_roles_role_idx" ON "user_global_roles"("role");
CREATE UNIQUE INDEX "user_global_roles_user_id_role_key" ON "user_global_roles"("user_id", "role");
CREATE UNIQUE INDEX "clubs_slug_key" ON "clubs"("slug");
CREATE INDEX "clubs_status_city_district_idx" ON "clubs"("status", "city", "district");
CREATE INDEX "club_members_club_id_role_idx" ON "club_members"("club_id", "role");
CREATE UNIQUE INDEX "club_members_user_id_club_id_key" ON "club_members"("user_id", "club_id");
CREATE INDEX "courts_club_id_active_status_idx" ON "courts"("club_id", "active", "status");
CREATE INDEX "schedules_club_id_day_of_week_idx" ON "schedules"("club_id", "day_of_week");
CREATE UNIQUE INDEX "schedules_club_id_court_id_day_of_week_key" ON "schedules"("club_id", "court_id", "day_of_week");
CREATE UNIQUE INDEX "allowed_durations_club_id_minutes_key" ON "allowed_durations"("club_id", "minutes");
CREATE INDEX "price_rules_club_id_day_of_week_duration_minutes_idx" ON "price_rules"("club_id", "day_of_week", "duration_minutes");
CREATE INDEX "court_blocks_court_id_start_at_end_at_idx" ON "court_blocks"("court_id", "start_at", "end_at");
CREATE UNIQUE INDEX "reservations_booking_code_key" ON "reservations"("booking_code");
CREATE INDEX "reservations_court_id_start_at_end_at_idx" ON "reservations"("court_id", "start_at", "end_at");
CREATE INDEX "reservations_player_id_start_at_idx" ON "reservations"("player_id", "start_at");
CREATE INDEX "reservations_club_id_start_at_idx" ON "reservations"("club_id", "start_at");

ALTER TABLE "user_global_roles" ADD CONSTRAINT "user_global_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "courts" ADD CONSTRAINT "courts_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "allowed_durations" ADD CONSTRAINT "allowed_durations_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "court_blocks" ADD CONSTRAINT "court_blocks_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "court_blocks" ADD CONSTRAINT "court_blocks_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "court_blocks" ADD CONSTRAINT "court_blocks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_confirmed_no_overlap"
EXCLUDE USING gist (
  "court_id" WITH =,
  tstzrange("start_at", "end_at", '[)') WITH &&
) WHERE ("status" = 'CONFIRMED');
