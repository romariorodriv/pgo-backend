import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const makeService = () => {
    const usersService = {
      findByEmail: jest.fn(),
      findByGoogleId: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
    };
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('access-token'),
    };
    const configService = {
      get: jest.fn().mockReturnValue(''),
    };
    const prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({ id: 'reset-1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
      pushDeviceToken: { deleteMany: jest.fn() },
      appNotification: { deleteMany: jest.fn() },
      profile: { updateMany: jest.fn() },
      friendship: { deleteMany: jest.fn() },
      $transaction: jest.fn((items) => Promise.all(items)),
    };
    const emailService = {
      sendPasswordReset: jest.fn().mockResolvedValue({ sent: true }),
    };

    return {
      service: new AuthService(
        usersService as never,
        jwtService as never,
        configService as never,
        prisma as never,
        emailService as never,
      ),
      usersService,
      jwtService,
      prisma,
      emailService,
    };
  };

  it('registers a normalized email and returns access plus refresh tokens', async () => {
    const { service, usersService, prisma } = makeService();
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    });

    const response = await service.register({
      name: ' Test User ',
      email: ' TEST@EXAMPLE.COM ',
      password: 'Password1',
    });

    expect(usersService.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: expect.not.stringContaining('Password1'),
      }),
    );
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(response.accessToken).toBe('access-token');
    expect(response.refreshToken).toEqual(expect.any(String));
  });

  it('uses a safe generic error for missing or wrong login credentials', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({ email: 'missing@example.com', password: 'Password1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const passwordHash = await bcrypt.hash('Password1', 4);
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      passwordHash,
      isActive: true,
    });

    await expect(
      service.login({ email: 'test@example.com', password: 'Wrongpass1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates a reset token only for an active existing account without exposing it', async () => {
    const { service, usersService, prisma, emailService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      isActive: true,
    });

    const response = await service.forgotPassword('TEST@EXAMPLE.COM');

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      },
    });
    expect(emailService.sendPasswordReset).toHaveBeenCalledWith(
      'test@example.com',
      expect.any(String),
    );
    expect(JSON.stringify(response)).not.toContain('token');
  });

  it('does not enumerate unknown emails in forgot password', async () => {
    const { service, usersService, prisma, emailService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.forgotPassword('none@example.com')).resolves.toEqual({
      message:
        'Si el correo esta registrado, recibiras instrucciones para restablecer tu contrasena.',
    });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('consumes reset tokens once and revokes sessions', async () => {
    const { service, prisma } = makeService();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-1', isActive: true },
    });

    await expect(
      service.resetPassword('reset-token', 'Password2'),
    ).resolves.toEqual({
      message: 'Tu contrasena fue actualizada correctamente',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: expect.any(String) },
    });
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: 'reset-1' },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects expired reset tokens', async () => {
    const { service, prisma } = makeService();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
      user: { id: 'user-1', isActive: true },
    });

    await expect(
      service.resetPassword('reset-token', 'Password2'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rotates refresh tokens', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        isActive: true,
      },
    });

    const response = await service.refresh('refresh-token');

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'refresh-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(response.refreshToken).toEqual(expect.any(String));
  });
});
