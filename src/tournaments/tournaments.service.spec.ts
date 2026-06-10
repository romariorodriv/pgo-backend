import { BadRequestException } from '@nestjs/common';
import { TournamentMatchStatus, TournamentStatus } from '@prisma/client';
import { TournamentsService } from './tournaments.service';

describe('TournamentsService MVP guards', () => {
  const notifications = {};
  let prisma: any;
  let service: TournamentsService;

  beforeEach(() => {
    prisma = {
      tournament: {
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
