import { BadRequestException } from '@nestjs/common';
import {
  TournamentMatchStatus,
  TournamentRegistrationMode,
  TournamentRegistrationStatus,
  TournamentStatus,
} from '@prisma/client';
import { TournamentsService } from './tournaments.service';

describe('TournamentsService MVP guards', () => {
  const notifications = {};
  let prisma: any;
  let service: TournamentsService;

  beforeEach(() => {
    prisma = {
      tournament: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      tournamentMatch: {
        count: jest.fn(),
      },
      tournamentRegistration: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    service = new TournamentsService(prisma, notifications as any);
  });

  it('rejects registration when tournament is full', async () => {
    prisma.tournament.findUnique
      .mockResolvedValueOnce({
        id: 't1',
        status: TournamentStatus.PUBLISHED,
        registrationsOpen: true,
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .mockResolvedValueOnce({ playerCapacity: 1 });
    prisma.tournamentRegistration.findFirst.mockResolvedValue(null);
    prisma.tournamentRegistration.findMany.mockResolvedValue([
      { userId: 'u0', partnerUserId: null },
    ]);

    await expect(
      service.registerSolo('t1', 'u1', 'Drive', 'Flexible'),
    ).rejects.toThrow('El torneo ya no tiene cupos disponibles');
  });

  it('excludes canceled, completed and expired tournaments from the public list', async () => {
    prisma.tournament.findMany.mockResolvedValue([]);

    await expect(service.findAll()).resolves.toEqual([]);
    expect(prisma.tournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            notIn: [TournamentStatus.CANCELED, TournamentStatus.COMPLETED],
          },
          startsAt: {
            gt: expect.any(Date),
          },
        },
      }),
    );
  });

  it('rejects registration when tournament date already passed', async () => {
    prisma.tournament.findUnique.mockResolvedValueOnce({
      id: 't1',
      status: TournamentStatus.PUBLISHED,
      registrationsOpen: true,
      startsAt: new Date(Date.now() - 60 * 1000),
    });

    await expect(
      service.registerSolo('t1', 'u1', 'Drive', 'Flexible'),
    ).rejects.toThrow('La fecha del torneo ya pasó');
  });

  it('loads alerts only for confirmed tournament registrations', async () => {
    prisma.tournament.findMany.mockResolvedValue([]);

    await expect(service.getMyAlerts('user-1')).resolves.toEqual({
      alerts: [],
    });

    expect(prisma.tournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          registrations: {
            some: {
              OR: [{ userId: 'user-1' }, { partnerUserId: 'user-1' }],
              status: TournamentRegistrationStatus.CONFIRMED,
            },
          },
        }),
        include: expect.objectContaining({
          registrations: expect.objectContaining({
            where: {
              status: TournamentRegistrationStatus.CONFIRMED,
            },
          }),
        }),
      }),
    );
  });

  it('does not build finished tournament alert for users without involved matches', () => {
    const alert = (service as any).buildTournamentAlert(
      {
        id: 't1',
        title: 'Torneo',
        category: '6TA',
        location: 'Club',
        startsAt: new Date('2026-07-11T10:00:00Z'),
        status: TournamentStatus.COMPLETED,
        updatedAt: new Date('2026-07-11T12:00:00Z'),
        registrations: [
          {
            userId: 'user-1',
            partnerUserId: 'user-2',
            mode: TournamentRegistrationMode.WITH_PARTNER,
            status: TournamentRegistrationStatus.CONFIRMED,
            user: { id: 'user-1', name: 'Jugador Uno' },
            partnerUser: { id: 'user-2', name: 'Jugador Dos' },
          },
        ],
        matches: [
          {
            id: 'm1',
            stage: 'final',
            matchNumber: 1,
            courtLabel: 'Cancha 1',
            scheduledAt: new Date('2026-07-11T10:00:00Z'),
            startedAt: null,
            teamOneLabel: 'Otra dupla / Rival',
            teamTwoLabel: 'Campeon / Subcampeon',
            winnerLabel: 'Campeon / Subcampeon',
            status: TournamentMatchStatus.FINISHED,
            score: '6-4',
            createdAt: new Date('2026-07-11T09:00:00Z'),
            updatedAt: new Date('2026-07-11T12:00:00Z'),
          },
        ],
      },
      'user-1',
    );

    expect(alert).toBeNull();
  });

  it('does not expose canceled tournaments through public detail lookup', async () => {
    prisma.tournament.findFirst.mockResolvedValue(null);

    await expect(service.findOne('t1')).rejects.toThrow('Torneo no encontrado');
    expect(prisma.tournament.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ id: 't1' }, { slug: 't1' }],
          status: {
            not: TournamentStatus.CANCELED,
          },
        },
      }),
    );
  });

  it('rejects registration when tournament is completed', async () => {
    prisma.tournament.findUnique.mockResolvedValueOnce({
      id: 't1',
      status: TournamentStatus.COMPLETED,
      registrationsOpen: false,
    });

    await expect(
      service.registerSolo('t1', 'u1', 'Drive', 'Flexible'),
    ).rejects.toThrow('Solo puedes inscribirte en torneos publicados');
  });

  it('rejects finalize with incomplete matches', async () => {
    prisma.tournament.findUnique
      .mockResolvedValueOnce({
        id: 't1',
        title: 'Torneo',
        category: '4TA',
        location: 'Club',
        startsAt: new Date(),
        photoUrl: null,
        createdById: 'admin',
      })
      .mockResolvedValueOnce({
        id: 't1',
        status: TournamentStatus.PUBLISHED,
        matches: [
          {
            id: 'm1',
            status: TournamentMatchStatus.PENDING,
            teamOneLabel: 'A',
            teamTwoLabel: 'B',
            winnerLabel: null,
          },
        ],
      });

    await expect(service.finalizeTournament('t1', 'admin')).rejects.toThrow(
      'No puedes finalizar el torneo hasta registrar todos los resultados',
    );
  });

  it('finalizes when every required match has result', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 't1' } as any);
    prisma.tournament.findUnique
      .mockResolvedValueOnce({
        id: 't1',
        title: 'Torneo',
        category: '4TA',
        location: 'Club',
        startsAt: new Date(),
        photoUrl: null,
        createdById: 'admin',
      })
      .mockResolvedValueOnce({
        id: 't1',
        status: TournamentStatus.PUBLISHED,
        matches: [
          {
            id: 'm1',
            status: TournamentMatchStatus.FINISHED,
            teamOneLabel: 'A',
            teamTwoLabel: 'B',
            winnerLabel: 'A',
          },
        ],
      });
    prisma.tournament.update.mockResolvedValue({});

    await expect(service.finalizeTournament('t1', 'admin')).resolves.toEqual({
      id: 't1',
    });
    expect(prisma.tournament.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: {
        status: TournamentStatus.COMPLETED,
        registrationsOpen: false,
      },
    });
  });

  it('validates score format', () => {
    expect(
      (service as any).ensureValidScore('6-4, 6-3', { required: true }),
    ).toBe('6-4, 6-3');
    expect(() =>
      (service as any).ensureValidScore('ganaron fácil', { required: true }),
    ).toThrow(BadRequestException);
  });

  it('blocks critical edits after bracket generation', async () => {
    prisma.tournament.findUnique.mockResolvedValueOnce({
      id: 't1',
      createdById: 'admin',
      tournamentType: 'Americano',
    });
    prisma.tournamentMatch.count.mockResolvedValue(1);

    await expect(
      service.update('t1', 'admin', { playerCapacity: 20 }),
    ).rejects.toThrow(
      'No puedes editar campos críticos porque el torneo ya tiene cruces o partidos',
    );
  });
});
