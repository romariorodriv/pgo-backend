import { OpenMatchAlertStatus } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { OpenMatchAlertsService } from './open-match-alerts.service';

describe('OpenMatchAlertsService public preview', () => {
  it('uses a strict public select and calculates available slots', async () => {
    const prisma = {
      openMatchAlert: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'match-id',
          category: '4ta',
          format: 'Dobles',
          startsAt: new Date('2026-06-10T20:00:00.000Z'),
          club: 'PGO Club',
          district: 'Miraflores',
          missingPlayers: 3,
          status: OpenMatchAlertStatus.OPEN,
          _count: { participants: 2 },
        }),
      },
    };
    const service = new OpenMatchAlertsService(prisma as never, {} as never);

    const preview = await service.findPublicPreview('match-id');

    expect(preview?.missingPlayers).toBe(1);
    expect(prisma.openMatchAlert.findUnique).toHaveBeenCalledWith({
      where: { id: 'match-id' },
      select: {
        id: true,
        category: true,
        format: true,
        startsAt: true,
        club: true,
        district: true,
        missingPlayers: true,
        status: true,
        _count: { select: { participants: true } },
      },
    });
    expect(preview).not.toHaveProperty('participants');
    expect(preview).not.toHaveProperty('organizer');
    expect(preview).not.toHaveProperty('invitations');
    expect(preview).not.toHaveProperty('coordinationUpdates');
  });
});

describe('OpenMatchAlertsService write safety', () => {
  const futureStartsAt = () =>
    new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const createBody = () => ({
    category: '4ta',
    format: 'Dobles',
    startsAt: futureStartsAt(),
    club: 'PGO Club',
    district: 'Miraflores',
    courtStatus: 'Reservada',
    missingPlayers: 2,
    costPerPerson: 30,
    paymentLabel: 'Yape',
  });

  it('blocks equivalent active duplicate open matches for the same organizer', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      openMatchAlert: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-alert' }),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new OpenMatchAlertsService(
      prisma as never,
      { sendToAllUsers: jest.fn(), sendToUsers: jest.fn() } as never,
    );

    await expect(service.create('user-1', createBody())).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(tx.openMatchAlert.create).not.toHaveBeenCalled();
  });

  it('lets the organizer delete an already canceled open match idempotently', async () => {
    const prisma = {
      openMatchAlert: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'alert-1',
          organizerId: 'user-1',
          status: OpenMatchAlertStatus.CANCELED,
          resultMatchId: null,
          club: 'PGO Club',
          category: '4ta',
          format: 'Dobles',
          participants: [],
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new OpenMatchAlertsService(
      prisma as never,
      { sendToUsers: jest.fn() } as never,
    );

    await expect(service.remove('alert-1', 'user-1')).resolves.toEqual({
      deleted: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
