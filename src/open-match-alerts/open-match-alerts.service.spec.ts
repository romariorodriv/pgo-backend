import { OpenMatchAlertStatus } from '@prisma/client';
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
    const service = new OpenMatchAlertsService(
      prisma as never,
      {} as never,
    );

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
