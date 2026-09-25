import { AdminRole } from '@prisma/client';
import { AdminJwtStrategy } from './admin-jwt.strategy';

describe('AdminJwtStrategy', () => {
  it('rejects non-admin subjectType payloads', async () => {
    const strategy = new AdminJwtStrategy(
      { jwtSecret: 'x'.repeat(32) } as never,
      { findActiveById: jest.fn() } as never,
    );

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'user@pgoapp.com',
        role: AdminRole.ANALYST,
        subjectType: 'PLAYER' as never,
      }),
    ).rejects.toThrow();
  });
});
