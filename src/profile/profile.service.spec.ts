import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProfileService } from './profile.service';

describe('ProfileService updateMyProfile', () => {
  const profileResponse = { id: 'user-1' };

  function buildService() {
    const tx = {
      user: { update: jest.fn() },
      profile: { upsert: jest.fn() },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      profile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new ProfileService(prisma as never);
    jest
      .spyOn(service, 'getMyProfile')
      .mockResolvedValue(profileResponse as never);
    return { service, prisma, tx };
  }

  it('upserts onboarding data when a new user has no profile', async () => {
    const { service, tx } = buildService();

    await service.updateMyProfile(
      'user-1',
      {
        name: 'Jugador',
        category: '6ta categoria',
        preferredClub: 'Club PGO',
        preferredSide: 'Ambos',
        categoryOrigin: 'manual',
        categoryIsProvisional: true,
        categorySuggested: '6ta categoria',
        categoryPreliminary: '6ta categoria',
        categoryMaxApplied: '6ta categoria',
        categoryScore: 10,
        categoryQuizAnswers: { experience: ['new'] },
        hasCompletedInitialOnboarding: true,
      },
      'request-1',
    );

    expect(tx.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: expect.objectContaining({
        userId: 'user-1',
        categoryOrigin: 'manual',
        categorySuggested: '6ta categoria',
        categoryQuizAnswers: { experience: ['new'] },
        hasCompletedInitialOnboarding: true,
      }),
      update: expect.objectContaining({
        categoryOrigin: 'manual',
        categorySuggested: '6ta categoria',
        categoryQuizAnswers: { experience: ['new'] },
        hasCompletedInitialOnboarding: true,
      }),
    });
  });

  it('ignores a base64 photo without failing the profile update', async () => {
    const { service, tx } = buildService();

    await service.updateMyProfile(
      'user-1',
      {
        name: 'Jugador',
        photoUrl: 'data:image/png;base64,AAAA',
      },
      'request-photo-base64',
    );

    expect(tx.profile.upsert).not.toHaveBeenCalled();
  });

  it('persists a valid https photo URL', async () => {
    const { service, tx } = buildService();
    const photoUrl = 'https://lh3.googleusercontent.com/photo.jpg';

    await service.updateMyProfile(
      'user-1',
      { name: 'Jugador', photoUrl },
      'request-photo-https',
    );

    expect(tx.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', photoUrl },
      update: { photoUrl },
    });
  });

  it('returns invalid_profile_payload for Prisma validation errors', async () => {
    const { service, prisma } = buildService();
    prisma.profile.findUnique.mockRejectedValue(
      new Prisma.PrismaClientValidationError('Unknown argument', {
        clientVersion: 'test',
      }),
    );

    await expect(
      service.updateMyProfile('user-1', { name: 'Jugador' }, 'request-3'),
    ).rejects.toMatchObject<BadRequestException>({
      status: 400,
      response: expect.objectContaining({
        code: 'invalid_profile_payload',
        requestId: 'request-3',
      }),
    });
  });

  it('returns profile_update_failed for schema drift errors', async () => {
    const { service, prisma } = buildService();
    prisma.profile.findUnique.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Missing column', {
        code: 'P2022',
        clientVersion: 'test',
        meta: { column: 'profiles.category_origin' },
      }),
    );

    await expect(
      service.updateMyProfile('user-1', { name: 'Jugador' }, 'request-2'),
    ).rejects.toMatchObject<InternalServerErrorException>({
      status: 500,
      response: expect.objectContaining({
        code: 'profile_update_failed',
        requestId: 'request-2',
      }),
    });
  });
});
