import { OpenMatchAlertStatus } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
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

describe('OpenMatchAlertsService chat', () => {
  const activeAlert = {
    id: 'alert-1',
    organizerId: 'organizer-1',
    status: OpenMatchAlertStatus.OPEN,
    startsAt: new Date(Date.now() + 60 * 60 * 1000),
    organizer: { id: 'organizer-1', name: 'Organizador' },
    participants: [{ userId: 'player-1' }],
  };

  function createPrisma(alert = activeAlert) {
    return {
      openMatchAlert: {
        findUnique: jest.fn().mockResolvedValue(alert),
      },
      openMatchChatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'chat-1',
            message: data.message,
            createdAt: new Date('2026-07-09T10:00:00.000Z'),
            user: {
              id: data.userId,
              name: 'Jugador',
              profile: { photoUrl: null },
            },
          }),
        ),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
  }

  it('allows confirmed participants to send normalized chat messages', async () => {
    const prisma = createPrisma();
    const notifications = { sendToUsers: jest.fn() };
    const service = new OpenMatchAlertsService(
      prisma as never,
      notifications as never,
    );

    const result = await service.createChatMessage(
      'alert-1',
      'player-1',
      '  Voy   llegando  ',
    );

    expect(prisma.openMatchChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          alertId: 'alert-1',
          userId: 'player-1',
          message: 'Voy llegando',
        },
      }),
    );
    expect(result.message).toBe('Voy llegando');
    expect(notifications.sendToUsers).toHaveBeenCalledWith(
      ['organizer-1'],
      expect.objectContaining({
        data: expect.objectContaining({ type: 'OPEN_MATCH_CHAT_MESSAGE' }),
      }),
    );
  });

  it('blocks users outside the open match chat', async () => {
    const service = new OpenMatchAlertsService(
      createPrisma() as never,
      { sendToUsers: jest.fn() } as never,
    );

    await expect(
      service.getChatMessages('alert-1', 'stranger-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks writing after the chat expiration window', async () => {
    const expiredAlert = {
      ...activeAlert,
      startsAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    };
    const service = new OpenMatchAlertsService(
      createPrisma(expiredAlert) as never,
      { sendToUsers: jest.fn() } as never,
    );

    await expect(
      service.createChatMessage('alert-1', 'player-1', 'Hola'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cleans chat messages for alerts older than 24 hours', async () => {
    const prisma = createPrisma();
    const service = new OpenMatchAlertsService(
      prisma as never,
      { sendToUsers: jest.fn() } as never,
    );

    const result = await service.cleanupExpiredChatMessages(
      new Date('2026-07-09T12:00:00.000Z'),
    );

    expect(result.count).toBe(2);
    expect(prisma.openMatchChatMessage.deleteMany).toHaveBeenCalledWith({
      where: {
        alert: {
          startsAt: {
            lt: new Date('2026-07-08T12:00:00.000Z'),
          },
        },
      },
    });
  });
});
