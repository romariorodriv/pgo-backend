#!/bin/bash
cd /home/ubuntu/pgo-backend
printf '%s\n' 'ALTER TABLE "profiles"' 'ADD COLUMN IF NOT EXISTS "has_seen_home_guide" BOOLEAN NOT NULL DEFAULT false,' 'ADD COLUMN IF NOT EXISTS "has_completed_initial_onboarding" BOOLEAN NOT NULL DEFAULT false;' | npx prisma db execute --stdin
echo '--- retry migrate deploy ---'
npx prisma migrate deploy
