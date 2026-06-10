ALTER TABLE "profiles"
ADD COLUMN "has_seen_home_guide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "has_completed_initial_onboarding" BOOLEAN NOT NULL DEFAULT false;
