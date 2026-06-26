import { NotificationsService } from './notifications.service';

describe('NotificationsService idempotency', () => {
  it('uses a stable user/type/target key for inbox notifications', async () => {
    const prisma = {
      appNotification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pushDeviceToken: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const service = new NotificationsService(prisma as never, config as never);

    await service.sendToUsers(['user-1', 'user-1'], {
      title: 'Nuevo partido abierto',
      body: 'Hay un partido compatible.',
      data: {
        type: 'OPEN_MATCH_CREATED',
        alertId: 'alert-1',
        screen: 'open_match_alert',
      },
    });

    expect(prisma.appNotification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          type: 'OPEN_MATCH_CREATED',
          title: 'Nuevo partido abierto',
          body: 'Hay un partido compatible.',
          data: {
            type: 'OPEN_MATCH_CREATED',
            alertId: 'alert-1',
            screen: 'open_match_alert',
          },
          idempotencyKey: 'user-1:OPEN_MATCH_CREATED:alert-1',
        },
      ],
      skipDuplicates: true,
    });
  });
});
