import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubStatus, CourtStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const mins = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const dateAtLima = (date: string, time: string) =>
  new Date(`${date}T${time}:00-05:00`);
const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async range(clubId: string, from: string, to: string, duration: number) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      !Number.isInteger(duration)
    )
      throw new BadRequestException({
        code: 'INVALID_AVAILABILITY_QUERY',
        message: 'Rango o duración inválidos',
      });
    const count =
      Math.round(
        (new Date(`${to}T12:00:00Z`).getTime() -
          new Date(`${from}T12:00:00Z`).getTime()) /
          86_400_000,
      ) + 1;
    if (count < 1 || count > 14)
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'El rango debe contener entre 1 y 14 días',
      });
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      include: {
        courts: true,
        schedules: true,
        allowedDurations: true,
        priceRules: true,
      },
    });
    if (!club || club.status !== ClubStatus.APPROVED)
      throw new NotFoundException({
        code: 'CLUB_NOT_FOUND',
        message: 'Club no disponible',
      });
    if (
      !club.allowedDurations.some(
        (item) => item.active && item.minutes === duration,
      )
    )
      throw new BadRequestException({
        code: 'INVALID_DURATION',
        message: 'Duración no permitida',
      });
    const courts = club.courts.filter(
      (court) => court.active && court.status !== CourtStatus.INACTIVE,
    );
    const rangeStart = dateAtLima(from, '00:00');
    const rangeEnd = dateAtLima(addDays(to, 1), '00:00');
    const [blocks, reservations] = await Promise.all([
      this.prisma.courtBlock.findMany({
        where: {
          courtId: { in: courts.map((court) => court.id) },
          startAt: { lt: rangeEnd },
          endAt: { gt: rangeStart },
        },
      }),
      this.prisma.reservation.findMany({
        where: {
          courtId: { in: courts.map((court) => court.id) },
          status: 'CONFIRMED',
          startAt: { lt: rangeEnd },
          endAt: { gt: rangeStart },
        },
      }),
    ]);
    const slots: Array<{
      date: string;
      startAt: string;
      endAt: string;
      durationMinutes: number;
      court: { id: string; name: string };
      price: string | null;
      available: boolean;
      reason?: string;
    }> = [];
    for (let offset = 0; offset < count; offset += 1) {
      const date = addDays(from, offset);
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      for (const court of courts) {
        const schedule =
          club.schedules.find(
            (item) => item.courtId === court.id && item.dayOfWeek === day,
          ) ??
          club.schedules.find(
            (item) => item.courtId === null && item.dayOfWeek === day,
          );
        if (!schedule?.active) continue;
        for (
          let start = mins(schedule.openTime);
          start + duration <= mins(schedule.closeTime);
          start += duration
        ) {
          const startAt = dateAtLima(date, clock(start));
          const endAt = new Date(startAt.getTime() + duration * 60_000);
          const rules = club.priceRules.filter(
            (rule) =>
              rule.active &&
              rule.dayOfWeek === day &&
              rule.durationMinutes === duration &&
              (rule.courtId === court.id || rule.courtId === null) &&
              start >= mins(rule.startTime) &&
              start + duration <= mins(rule.endTime),
          );
          const rule =
            rules.find((item) => item.courtId === court.id) ??
            rules.find((item) => item.courtId === null);
          const block = blocks.find(
            (item) =>
              item.courtId === court.id &&
              item.startAt < endAt &&
              item.endAt > startAt,
          );
          const occupied = reservations.some(
            (item) =>
              item.courtId === court.id &&
              item.startAt < endAt &&
              item.endAt > startAt,
          );
          const reason =
            court.status === CourtStatus.MAINTENANCE ||
            block?.reason === 'MAINTENANCE'
              ? 'MAINTENANCE'
              : block
                ? 'BLOCKED'
                : occupied
                  ? 'OCCUPIED'
                  : startAt <= new Date()
                    ? 'PAST'
                    : !rule
                      ? 'PRICE_NOT_CONFIGURED'
                      : undefined;
          slots.push({
            date,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            durationMinutes: duration,
            court: { id: court.id, name: court.name },
            price: rule?.price.toString() ?? null,
            available: !reason,
            ...(reason ? { reason } : {}),
          });
        }
      }
    }
    return slots;
  }
}
