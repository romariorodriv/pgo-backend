import { Injectable } from '@nestjs/common';
import {
  MatchStatus,
  OpenMatchAlertStatus,
  TournamentRegistrationStatus,
  TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProductActivityEvent } from './admin-dashboard.types';

@Injectable()
export class AdminDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  countUsers(from?: Date, to?: Date) {
    return this.prisma.user.count({
      where: { isActive: true, createdAt: this.range(from, to) },
    });
  }

  countMatches(from: Date, to: Date) {
    return this.prisma.match.count({
      where: {
        status: { not: MatchStatus.CANCELED },
        createdAt: this.range(from, to),
      },
    });
  }

  countTournaments(from: Date, to: Date) {
    return this.prisma.tournament.count({
      where: {
        status: { not: TournamentStatus.CANCELED },
        createdAt: this.range(from, to),
      },
    });
  }

  countRegistrations(from: Date, to: Date) {
    return this.prisma.tournamentRegistration.count({
      where: {
        status: { not: TournamentRegistrationStatus.CANCELED },
        createdAt: this.range(from, to),
      },
    });
  }

  countUpcomingTournaments(now: Date) {
    return this.prisma.tournament.count({
      where: { status: TournamentStatus.PUBLISHED, startsAt: { gte: now } },
    });
  }

  usersCreated(from: Date, to: Date) {
    return this.prisma.user.findMany({
      where: { isActive: true, createdAt: this.range(from, to) },
      select: { id: true, createdAt: true },
    });
  }

  matchesCreated(from: Date, to: Date) {
    return this.prisma.match.findMany({
      where: {
        status: { not: MatchStatus.CANCELED },
        createdAt: this.range(from, to),
      },
      select: { id: true, createdAt: true },
    });
  }

  openMatchesCreated(from: Date, to: Date) {
    return this.prisma.openMatchAlert.findMany({
      where: {
        status: { not: OpenMatchAlertStatus.CANCELED },
        createdAt: this.range(from, to),
      },
      select: { id: true, createdAt: true },
    });
  }

  tournamentsCreated(from: Date, to: Date) {
    return this.prisma.tournament.findMany({
      where: {
        status: { not: TournamentStatus.CANCELED },
        createdAt: this.range(from, to),
      },
      select: { id: true, createdAt: true },
    });
  }

  tournamentRegistrationsCreated(from: Date, to: Date) {
    return this.prisma.tournamentRegistration.findMany({
      where: {
        status: { not: TournamentRegistrationStatus.CANCELED },
        tournament: { status: { not: TournamentStatus.CANCELED } },
        createdAt: this.range(from, to),
      },
      select: { id: true, createdAt: true },
    });
  }

  async productActivityEvents(
    from: Date,
    to: Date,
  ): Promise<ProductActivityEvent[]> {
    const [
      matches,
      participants,
      openMatches,
      openParticipants,
      tournaments,
      registrations,
    ] = await Promise.all([
      this.prisma.match.findMany({
        where: {
          status: { not: MatchStatus.CANCELED },
          createdAt: this.range(from, to),
        },
        select: { createdById: true, createdAt: true },
      }),
      this.prisma.matchParticipant.findMany({
        where: {
          createdAt: this.range(from, to),
          match: { status: { not: MatchStatus.CANCELED } },
        },
        select: { userId: true, createdAt: true },
      }),
      this.prisma.openMatchAlert.findMany({
        where: {
          status: { not: OpenMatchAlertStatus.CANCELED },
          createdAt: this.range(from, to),
        },
        select: { organizerId: true, createdAt: true },
      }),
      this.prisma.openMatchParticipant.findMany({
        where: {
          createdAt: this.range(from, to),
          alert: { status: { not: OpenMatchAlertStatus.CANCELED } },
        },
        select: { userId: true, createdAt: true },
      }),
      this.prisma.tournament.findMany({
        where: {
          status: { not: TournamentStatus.CANCELED },
          createdAt: this.range(from, to),
        },
        select: { createdById: true, createdAt: true },
      }),
      this.prisma.tournamentRegistration.findMany({
        where: {
          status: { not: TournamentRegistrationStatus.CANCELED },
          tournament: { status: { not: TournamentStatus.CANCELED } },
          createdAt: this.range(from, to),
        },
        select: { userId: true, partnerUserId: true, createdAt: true },
      }),
    ]);

    return [
      ...matches.map((item) => ({
        userId: item.createdById,
        occurredAt: item.createdAt,
      })),
      ...participants.map((item) => ({
        userId: item.userId,
        occurredAt: item.createdAt,
      })),
      ...openMatches.map((item) => ({
        userId: item.organizerId,
        occurredAt: item.createdAt,
      })),
      ...openParticipants.map((item) => ({
        userId: item.userId,
        occurredAt: item.createdAt,
      })),
      ...tournaments.map((item) => ({
        userId: item.createdById,
        occurredAt: item.createdAt,
      })),
      ...registrations.flatMap((item) => [
        { userId: item.userId, occurredAt: item.createdAt },
        ...(item.partnerUserId
          ? [{ userId: item.partnerUserId, occurredAt: item.createdAt }]
          : []),
      ]),
    ];
  }

  productActivityUserIds(from: Date, to: Date) {
    return Promise.all([
      this.prisma.match.findMany({
        where: {
          status: { not: MatchStatus.CANCELED },
          createdAt: this.range(from, to),
        },
        select: { createdById: true },
      }),
      this.prisma.matchParticipant.findMany({
        where: {
          createdAt: this.range(from, to),
          match: { status: { not: MatchStatus.CANCELED } },
        },
        select: { userId: true },
      }),
      this.prisma.openMatchAlert.findMany({
        where: {
          status: { not: OpenMatchAlertStatus.CANCELED },
          createdAt: this.range(from, to),
        },
        select: { organizerId: true },
      }),
      this.prisma.openMatchParticipant.findMany({
        where: {
          createdAt: this.range(from, to),
          alert: { status: { not: OpenMatchAlertStatus.CANCELED } },
        },
        select: { userId: true },
      }),
      this.prisma.tournament.findMany({
        where: {
          status: { not: TournamentStatus.CANCELED },
          createdAt: this.range(from, to),
        },
        select: { createdById: true },
      }),
      this.prisma.tournamentRegistration.findMany({
        where: {
          status: { not: TournamentRegistrationStatus.CANCELED },
          tournament: { status: { not: TournamentStatus.CANCELED } },
          createdAt: this.range(from, to),
        },
        select: { userId: true, partnerUserId: true },
      }),
    ]);
  }

  usersForActivation(cohortEnd: Date) {
    return this.prisma.user.findMany({
      where: { isActive: true, createdAt: { lt: cohortEnd } },
      select: { id: true, createdAt: true },
    });
  }

  tournamentsAttention(now: Date, until: Date) {
    return this.prisma.tournament.findMany({
      where: {
        status: { in: [TournamentStatus.PUBLISHED, TournamentStatus.DRAFT] },
        startsAt: { gte: now, lte: until },
      },
      orderBy: { startsAt: 'asc' },
      take: 30,
      select: {
        id: true,
        title: true,
        startsAt: true,
        category: true,
        location: true,
        playerCapacity: true,
        status: true,
        createdBy: { select: { name: true } },
        registrations: {
          where: { status: { not: TournamentRegistrationStatus.CANCELED } },
          select: { id: true },
        },
      },
    });
  }

  recent(limit: number) {
    return Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, name: true, createdAt: true },
      }),
      this.prisma.match.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          clubName: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.tournament.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.tournamentRegistration.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
          tournament: { select: { id: true, title: true } },
        },
      }),
      this.prisma.openMatchAlert.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          club: true,
          createdAt: true,
          organizer: { select: { id: true, name: true } },
        },
      }),
    ]);
  }

  private range(from?: Date, to?: Date) {
    return from && to ? { gte: from, lt: to } : undefined;
  }
}
