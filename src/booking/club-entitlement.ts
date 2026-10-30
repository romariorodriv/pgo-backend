import { Prisma } from '@prisma/client';

export const TRIAL_MS = 168 * 60 * 60 * 1000;
export type ClubEntitlement = {
  status: string;
  isPublished?: boolean;
  legacyAccess?: boolean;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
};

// Dates and permissions come from the server, never from browser state.
export function canReceiveBookings(club: ClubEntitlement, now = new Date()): boolean {
  return club.status === 'APPROVED' && club.isPublished === true && (
    club.legacyAccess === true || !!(
      club.trialStartedAt && club.trialEndsAt &&
      club.trialStartedAt <= now && club.trialEndsAt > now
    )
  );
}

export function withinBookingHorizon(club: ClubEntitlement, endAt: Date): boolean {
  return club.legacyAccess === true || !!club.trialEndsAt && endAt <= club.trialEndsAt;
}

export function publicClubWhere(now = new Date()): Prisma.ClubWhereInput {
  return {
    status: 'APPROVED',
    isPublished: true,
    OR: [
      { legacyAccess: true },
      { trialStartedAt: { lte: now }, trialEndsAt: { gt: now } },
    ],
  };
}
