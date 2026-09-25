import {
  MatchStatus,
  OpenMatchAlertStatus,
  TournamentRegistrationStatus,
  TournamentStatus,
} from '@prisma/client';
import { AdminDashboardRepository } from './admin-dashboard.repository';

describe('AdminDashboardRepository', () => {
  it('excludes canceled states from product activity read queries', async () => {
    const prisma = {
      match: { findMany: jest.fn().mockResolvedValue([]) },
      matchParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      openMatchAlert: { findMany: jest.fn().mockResolvedValue([]) },
      openMatchParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      tournament: { findMany: jest.fn().mockResolvedValue([]) },
      tournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const repository = new AdminDashboardRepository(prisma as never);
    const from = new Date('2026-07-01T05:00:00.000Z');
    const to = new Date('2026-07-31T05:00:00.000Z');

    await repository.productActivityEvents(from, to);

    expect(prisma.match.findMany).toHaveBeenCalledWith({
      where: {
        status: { not: MatchStatus.CANCELED },
        createdAt: { gte: from, lt: to },
      },
      select: { createdById: true, createdAt: true },
    });
    expect(prisma.openMatchAlert.findMany).toHaveBeenCalledWith({
      where: {
        status: { not: OpenMatchAlertStatus.CANCELED },
        createdAt: { gte: from, lt: to },
      },
      select: { organizerId: true, createdAt: true },
    });
    expect(prisma.tournament.findMany).toHaveBeenCalledWith({
      where: {
        status: { not: TournamentStatus.CANCELED },
        createdAt: { gte: from, lt: to },
      },
      select: { createdById: true, createdAt: true },
    });
    expect(prisma.tournamentRegistration.findMany).toHaveBeenCalledWith({
      where: {
        status: { not: TournamentRegistrationStatus.CANCELED },
        tournament: { status: { not: TournamentStatus.CANCELED } },
        createdAt: { gte: from, lt: to },
      },
      select: { userId: true, partnerUserId: true, createdAt: true },
    });
  });
});
