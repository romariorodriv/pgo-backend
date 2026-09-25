import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { verify } from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Booking concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = randomUUID().slice(0, 8);
  const password = 'BookingTest123!';
  let playerA: { token: string; id: string };
  let playerB: { token: string; id: string };
  let clubId: string;
  let otherClubId: string;
  let courtId: string;
  let otherCourtId: string;
  let startAt: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const register = async (label: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: `Booking ${label}`,
          email: `booking-${label}-${suffix}@example.test`,
          password,
        })
        .expect(201);
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(
        verify(response.body.accessToken, process.env.JWT_SECRET as string),
      ).toMatchObject({ sub: response.body.user.id });
      return {
        token: response.body.accessToken as string,
        id: response.body.user.id as string,
      };
    };
    playerA = await register('a');
    playerB = await register('b');
    const club = await prisma.club.create({
      data: {
        name: `Booking Club ${suffix}`,
        slug: `booking-club-${suffix}`,
        email: `club-${suffix}@example.test`,
        phone: '999999999',
        address: 'Av. QA 123',
        district: 'Surco',
        city: 'Lima',
        status: 'APPROVED',
      },
    });
    clubId = club.id;
    await prisma.clubMember.create({
      data: { clubId, userId: playerA.id, role: 'OWNER' },
    });
    const court = await prisma.court.create({
      data: { clubId, name: 'Court 1' },
    });
    courtId = court.id;
    const otherClub = await prisma.club.create({
      data: {
        name: `Other Club ${suffix}`,
        slug: `other-club-${suffix}`,
        email: `other-${suffix}@example.test`,
        phone: '988888888',
        address: 'Av. QA 456',
        district: 'Miraflores',
        city: 'Lima',
        status: 'APPROVED',
      },
    });
    otherClubId = otherClub.id;
    otherCourtId = (
      await prisma.court.create({
        data: { clubId: otherClubId, name: 'Court B' },
      })
    ).id;
    const future = new Date(Date.now() + 10 * 86_400_000);
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(future);
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
    startAt = new Date(`${date}T19:00:00-05:00`).toISOString();
    await prisma.allowedDuration.create({ data: { clubId, minutes: 90 } });
    await prisma.schedule.create({
      data: { clubId, dayOfWeek, openTime: '07:00', closeTime: '23:00' },
    });
    await prisma.priceRule.create({
      data: {
        clubId,
        dayOfWeek,
        startTime: '07:00',
        endTime: '23:00',
        durationMinutes: 90,
        price: '120.00',
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.reservation.deleteMany({ where: { clubId } });
      await prisma.priceRule.deleteMany({ where: { clubId } });
      await prisma.schedule.deleteMany({ where: { clubId } });
      await prisma.allowedDuration.deleteMany({ where: { clubId } });
      await prisma.court.deleteMany({ where: { clubId } });
      await prisma.court.deleteMany({ where: { clubId: otherClubId } });
      await prisma.clubMember.deleteMany({ where: { clubId } });
      await prisma.club.deleteMany({ where: { id: clubId } });
      await prisma.club.deleteMany({ where: { id: otherClubId } });
      const userIds = [playerA?.id, playerB?.id].filter((id): id is string =>
        Boolean(id),
      );
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await app.close();
    }
  });

  const reserve = (token: string, value = startAt) =>
    request(app.getHttpServer())
      .post('/api/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ courtId, startAt: value, durationMinutes: 90 });

  it('allows one winner, rejects exact/partial overlap, frees slot after cancellation', async () => {
    const [first, second] = await Promise.all([
      reserve(playerA.token),
      reserve(playerB.token),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const winner =
      first.status === 201
        ? { response: first, player: playerA }
        : { response: second, player: playerB };
    const loser = winner.player.id === playerA.id ? playerB : playerA;
    expect(
      await prisma.reservation.count({
        where: { courtId, status: 'CONFIRMED' },
      }),
    ).toBe(1);

    const partial = new Date(
      new Date(startAt).getTime() + 30 * 60_000,
    ).toISOString();
    const partialResponse = await reserve(loser.token, partial);
    expect(partialResponse.status).toBe(409);
    expect(partialResponse.body.code).toBe('SLOT_NOT_AVAILABLE');

    await request(app.getHttpServer())
      .post(`/api/reservations/${winner.response.body.id}/cancel`)
      .set('Authorization', `Bearer ${winner.player.token}`)
      .expect(201);
    await reserve(loser.token).expect(201);
  });

  it('prevents a member of club A from editing a court owned by club B', async () => {
    await request(app.getHttpServer())
      .patch(`/api/club/courts/${otherCourtId}`)
      .set('Authorization', `Bearer ${playerA.token}`)
      .send({ name: 'Unauthorized update' })
      .expect(403);
  });
});
