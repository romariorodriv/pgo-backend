import { HttpException, UnauthorizedException } from '@nestjs/common';
import { AdminRole, AdminStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AdminAuthService } from './admin-auth.service';

describe('AdminAuthService', () => {
  const makeService = async () => {
    const admin = {
      id: 'admin-1',
      email: 'admin@pgoapp.com',
      name: 'Admin PGO',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      passwordHash: (await bcrypt.hash('StrongPass1!', 4)) as string,
      role: AdminRole.SUPER_ADMIN,
      status: AdminStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
    };
    const repository = {
      findByEmail: jest.fn().mockResolvedValue(admin),
      recordFailedLogin: jest.fn(),
      recordSuccessfulLogin: jest.fn().mockResolvedValue(admin),
      createRefreshToken: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
      findRefreshToken: jest.fn(),
      rotateRefreshToken: jest.fn(),
      revokeByHash: jest.fn(),
      revokeAll: jest.fn(),
    };
    const tokens = {
      generateRefreshToken: jest.fn().mockReturnValue('refresh-token'),
      hashToken: jest.fn((value: string) => `hash:${value}`),
      signAccessToken: jest.fn().mockResolvedValue('admin-access-token'),
    };
    const config = { maxLoginAttempts: 2, lockMinutes: 15, refreshTtlDays: 30 };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new AdminAuthService(
        repository as never,
        tokens as never,
        config as never,
        audit as never,
      ),
      admin,
      repository,
      tokens,
    };
  };

  it('normalizes email and logs in with separate admin token', async () => {
    const { service, repository, tokens } = await makeService();
    const result = await service.login(
      ' ADMIN@PGOAPP.COM ',
      'StrongPass1!',
      {},
    );

    expect(repository.findByEmail).toHaveBeenCalledWith('admin@pgoapp.com');
    expect(tokens.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'ADMIN',
        role: AdminRole.SUPER_ADMIN,
      }),
    );
    expect(result.accessToken).toBe('admin-access-token');
  });

  it('uses the same generic error for unknown and wrong credentials', async () => {
    const { service, repository } = await makeService();
    repository.findByEmail.mockResolvedValueOnce(null);
    await expect(
      service.login('none@pgoapp.com', 'StrongPass1!', {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      service.login('admin@pgoapp.com', 'WrongPass1!', {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('locks admin after configured failed attempts', async () => {
    const { service, admin } = await makeService();
    admin.failedLoginAttempts = 1;
    await expect(
      service.login('admin@pgoapp.com', 'WrongPass1!', {}),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rotates refresh tokens', async () => {
    const { service, admin, repository } = await makeService();
    repository.findRefreshToken.mockResolvedValue({
      id: 'old-refresh',
      adminUserId: admin.id,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      adminUser: admin,
    });
    const result = await service.refresh('old-token', {});

    expect(repository.rotateRefreshToken).toHaveBeenCalled();
    expect(result.refreshToken).toBe('refresh-token');
  });
});
