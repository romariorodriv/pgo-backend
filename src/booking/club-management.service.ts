import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from './club-access.service';
import {
  CreateCourtBlockDto,
  CreateCourtDto,
  CreatePriceRuleDto,
  SetSchedulesDto,
} from './booking.dto';

@Injectable()
export class ClubManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
  ) {}
  async context(userId: string) {
    return (await this.access.membership(userId)).club;
  }
  async dashboard(userId: string) {
    const club = await this.context(userId);
    const now = new Date();
    const localDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const start = new Date(`${localDate}T00:00:00-05:00`);
    const end = new Date(start.getTime() + 86_400_000);
    const [reservationsToday, upcoming, activeCourts, revenue] =
      await Promise.all([
        this.prisma.reservation.count({
          where: {
            clubId: club.id,
            status: 'CONFIRMED',
            startAt: { gte: start, lt: end },
          },
        }),
        this.prisma.reservation.count({
          where: { clubId: club.id, status: 'CONFIRMED', startAt: { gt: now } },
        }),
        this.prisma.court.count({
          where: { clubId: club.id, active: true, status: 'ACTIVE' },
        }),
        this.prisma.reservation.aggregate({
          where: {
            clubId: club.id,
            status: 'CONFIRMED',
            startAt: { gte: start, lt: end },
          },
          _sum: { price: true },
        }),
      ]);
    return {
      reservationsToday,
      upcoming,
      activeCourts,
      occupancy: activeCourts
        ? Math.round((reservationsToday / (activeCourts * 10)) * 100)
        : 0,
      estimatedRevenueToday: revenue._sum.price?.toString() ?? '0',
    };
  }
  async courts(userId: string) {
    const club = await this.context(userId);
    return this.prisma.court.findMany({
      where: { clubId: club.id },
      orderBy: { name: 'asc' },
    });
  }
  async createCourt(userId: string, dto: CreateCourtDto) {
    const club = await this.context(userId);
    return this.prisma.court.create({ data: { ...dto, clubId: club.id } });
  }
  async updateCourt(userId: string, id: string, dto: Partial<CreateCourtDto>) {
    await this.access.court(userId, id);
    return this.prisma.court.update({ where: { id }, data: dto });
  }
  async schedules(userId: string) {
    const club = await this.context(userId);
    const [schedules, durations] = await Promise.all([
      this.prisma.schedule.findMany({ where: { clubId: club.id } }),
      this.prisma.allowedDuration.findMany({ where: { clubId: club.id } }),
    ]);
    return { schedules, durations };
  }
  async setSchedules(userId: string, dto: SetSchedulesDto) {
    const club = await this.context(userId);
    for (const item of dto.schedules) {
      if (item.openTime >= item.closeTime)
        throw new BadRequestException({
          code: 'INVALID_SCHEDULE',
          message: 'Horario inválido',
        });
      if (
        item.courtId &&
        !(await this.prisma.court.findFirst({
          where: { id: item.courtId, clubId: club.id },
        }))
      )
        throw new BadRequestException({
          code: 'FOREIGN_COURT',
          message: 'Cancha ajena',
        });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.schedule.deleteMany({ where: { clubId: club.id } });
      await tx.schedule.createMany({
        data: dto.schedules.map((item) => ({
          ...item,
          courtId: item.courtId ?? null,
          clubId: club.id,
        })),
      });
      await tx.allowedDuration.deleteMany({ where: { clubId: club.id } });
      await tx.allowedDuration.createMany({
        data: [...new Set(dto.durations)].map((minutes) => ({
          clubId: club.id,
          minutes,
        })),
      });
      return { ok: true };
    });
  }
  async prices(userId: string) {
    const club = await this.context(userId);
    return this.prisma.priceRule.findMany({
      where: { clubId: club.id },
      orderBy: { dayOfWeek: 'asc' },
    });
  }
  async addPrice(userId: string, dto: CreatePriceRuleDto) {
    const club = await this.context(userId);
    if (dto.startTime >= dto.endTime)
      throw new BadRequestException({
        code: 'INVALID_PRICE_RANGE',
        message: 'Rango inválido',
      });
    if (
      dto.courtId &&
      !(await this.prisma.court.findFirst({
        where: { id: dto.courtId, clubId: club.id },
      }))
    )
      throw new BadRequestException({
        code: 'FOREIGN_COURT',
        message: 'Cancha ajena',
      });
    return this.prisma.priceRule.create({
      data: {
        ...dto,
        price: new Prisma.Decimal(dto.price),
        clubId: club.id,
        courtId: dto.courtId ?? null,
      },
    });
  }
  async blocks(userId: string) {
    const club = await this.context(userId);
    return this.prisma.courtBlock.findMany({
      where: { clubId: club.id },
      orderBy: { startAt: 'desc' },
    });
  }
  async addBlock(userId: string, dto: CreateCourtBlockDto) {
    const court = await this.access.court(userId, dto.courtId);
    const startAt = new Date(
      dto.startAt ?? `${dto.date}T${dto.start}:00-05:00`,
    );
    const endAt = new Date(dto.endAt ?? `${dto.date}T${dto.end}:00-05:00`);
    if (!(startAt < endAt))
      throw new BadRequestException({
        code: 'INVALID_BLOCK_RANGE',
        message: 'Rango inválido',
      });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${court.id}))::text`;
      const occupied = await tx.reservation.count({
        where: {
          courtId: court.id,
          status: 'CONFIRMED',
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      if (occupied)
        throw new ConflictException({
          code: 'SLOT_NOT_AVAILABLE',
          message: 'Existen reservas en el rango',
        });
      return tx.courtBlock.create({
        data: {
          clubId: court.clubId,
          courtId: court.id,
          startAt,
          endAt,
          reason: dto.reason,
          notes: dto.notes,
          createdByUserId: userId,
        },
      });
    });
  }
  async reservations(userId: string) {
    const club = await this.context(userId);
    return this.prisma.reservation.findMany({
      where: { clubId: club.id },
      include: {
        court: true,
        player: { select: { id: true, name: true, email: true } },
      },
      orderBy: { startAt: 'desc' },
    });
  }
  async calendar(userId: string, from: Date, to: Date) {
    const club = await this.context(userId);
    const [reservations, blocks, courts] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { clubId: club.id, startAt: { lt: to }, endAt: { gt: from } },
        include: {
          court: true,
          player: { select: { name: true, email: true } },
        },
      }),
      this.prisma.courtBlock.findMany({
        where: { clubId: club.id, startAt: { lt: to }, endAt: { gt: from } },
      }),
      this.prisma.court.findMany({ where: { clubId: club.id } }),
    ]);
    return { reservations, blocks, courts };
  }
  async clients(userId: string) {
    const rows = await this.reservations(userId);
    const clients = new Map<
      string,
      {
        name: string;
        email: string | null;
        phone: string | null;
        reservations: number;
        lastReservation: Date;
      }
    >();
    for (const row of rows) {
      const key = row.playerId ?? `guest:${row.guestName}:${row.guestPhone}`;
      const previous = clients.get(key);
      if (previous) previous.reservations += 1;
      else
        clients.set(key, {
          name: row.player?.name ?? row.guestName ?? 'Invitado',
          email: row.player?.email ?? null,
          phone: row.guestPhone,
          reservations: 1,
          lastReservation: row.startAt,
        });
    }
    return [...clients.values()];
  }
}
