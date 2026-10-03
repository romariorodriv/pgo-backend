import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma, ReservationSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from './club-access.service';
import { CreateReservationDto } from './booking.dto';

const mins = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const limaParts = (date: Date) => ({
  date: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date),
  time: new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date),
});

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
  ) {}

  private code() {
    return `PGO-${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  async create(
    userId: string,
    dto: CreateReservationDto,
    source: ReservationSource = ReservationSource.WEB_PLAYER,
  ) {
    const startAt = new Date(dto.startAt);
    if (Number.isNaN(startAt.valueOf()) || startAt <= new Date())
      throw new BadRequestException({
        code: 'INVALID_START_AT',
        message: 'Horario inválido',
      });
    const endAt = new Date(startAt.getTime() + dto.durationMinutes * 60_000);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.courtId}))::text`;
          const court = await tx.court.findUnique({
            where: { id: dto.courtId },
            include: { club: true },
          });
          if (!court)
            throw new NotFoundException({
              code: 'COURT_NOT_FOUND',
              message: 'Cancha no encontrada',
            });
          if (source === ReservationSource.CLUB_MANUAL)
            await this.access.membership(userId, court.clubId);
          if (
            court.club.status !== 'APPROVED' ||
            !court.active ||
            court.status !== 'ACTIVE'
          )
            throw new ConflictException({
              code: 'SLOT_NOT_AVAILABLE',
              message: 'Cancha no disponible',
            });
          const allowed = await tx.allowedDuration.findUnique({
            where: {
              clubId_minutes: {
                clubId: court.clubId,
                minutes: dto.durationMinutes,
              },
            },
          });
          if (!allowed?.active)
            throw new BadRequestException({
              code: 'INVALID_DURATION',
              message: 'Duración no permitida',
            });
          const local = limaParts(startAt);
          const day = new Date(`${local.date}T12:00:00Z`).getUTCDay();
          const schedules = await tx.schedule.findMany({
            where: {
              clubId: court.clubId,
              dayOfWeek: day,
              OR: [{ courtId: court.id }, { courtId: null }],
            },
          });
          const schedule =
            schedules.find((item) => item.courtId === court.id) ??
            schedules.find((item) => item.courtId === null);
          const startMinutes = mins(local.time);
          if (
            !schedule?.active ||
            startMinutes < mins(schedule.openTime) ||
            startMinutes + dto.durationMinutes > mins(schedule.closeTime)
          )
            throw new ConflictException({
              code: 'SLOT_NOT_AVAILABLE',
              message: 'Horario fuera de apertura',
            });
          const rules = await tx.priceRule.findMany({
            where: {
              clubId: court.clubId,
              dayOfWeek: day,
              durationMinutes: dto.durationMinutes,
              active: true,
              OR: [{ courtId: court.id }, { courtId: null }],
            },
          });
          const eligible = rules.filter(
            (rule) =>
              startMinutes >= mins(rule.startTime) &&
              startMinutes + dto.durationMinutes <= mins(rule.endTime),
          );
          const priceRule =
            eligible.find((item) => item.courtId === court.id) ??
            eligible.find((item) => item.courtId === null);
          if (!priceRule)
            throw new ConflictException({
              code: 'PRICE_NOT_CONFIGURED',
              message: 'No existe precio para el horario',
            });
          if (
            dto.expectedPrice !== undefined &&
            Math.round(Number(dto.expectedPrice) * 100) !== Math.round(Number(priceRule.price) * 100)
          )
            throw new ConflictException({
              code: 'PRICE_CHANGED',
              message: 'La tarifa cambió. Vuelve a seleccionar el turno para revisar el precio actualizado.',
            });
          const [blocked, occupied] = await Promise.all([
            tx.courtBlock.count({
              where: {
                courtId: court.id,
                startAt: { lt: endAt },
                endAt: { gt: startAt },
              },
            }),
            tx.reservation.count({
              where: {
                courtId: court.id,
                status: 'CONFIRMED',
                startAt: { lt: endAt },
                endAt: { gt: startAt },
              },
            }),
          ]);
          if (blocked || occupied)
            throw new ConflictException({
              code: 'SLOT_NOT_AVAILABLE',
              message: 'El horario ya no está disponible',
            });
          let playerId: string | null =
            source === ReservationSource.WEB_PLAYER ||
            source === ReservationSource.MOBILE
              ? userId
              : null;
          if (source === ReservationSource.CLUB_MANUAL && dto.playerEmail) {
            const player = await tx.user.findUnique({
              where: { email: dto.playerEmail.toLowerCase() },
            });
            if (!player)
              throw new NotFoundException({
                code: 'PLAYER_NOT_FOUND',
                message: 'Jugador no encontrado',
              });
            playerId = player.id;
          }
          if (
            source === ReservationSource.CLUB_MANUAL &&
            !playerId &&
            !dto.guestName
          )
            throw new BadRequestException({
              code: 'GUEST_REQUIRED',
              message: 'Indica jugador o invitado',
            });
          return tx.reservation.create({
            data: {
              bookingCode: this.code(),
              clubId: court.clubId,
              courtId: court.id,
              playerId,
              createdByUserId: userId,
              startAt,
              endAt,
              durationMinutes: dto.durationMinutes,
              price: priceRule.price,
              source,
              guestName: dto.guestName,
              guestPhone: dto.guestPhone,
              notes: dto.notes,
            },
            include: { club: true, court: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;
      const code = (error as { code?: string; meta?: { code?: string } })?.code;
      const detail = JSON.stringify((error as { meta?: unknown })?.meta ?? '');
      if (
        code === 'P2004' ||
        code === '23P01' ||
        detail.includes('23P01') ||
        detail.includes('reservations_confirmed_no_overlap')
      )
        throw new ConflictException({
          code: 'SLOT_NOT_AVAILABLE',
          message: 'El horario ya no está disponible',
        });
      throw error;
    }
  }

  mine(userId: string) {
    return this.prisma.reservation.findMany({
      where: { playerId: userId },
      include: { club: true, court: true },
      orderBy: { startAt: 'desc' },
    });
  }

  async oneForPlayer(userId: string, id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { club: true, court: true },
    });
    if (!reservation)
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: 'Reserva no encontrada',
      });
    if (reservation.playerId !== userId)
      throw new ForbiddenException({
        code: 'RESERVATION_FORBIDDEN',
        message: 'Reserva ajena',
      });
    return reservation;
  }

  async cancel(userId: string, id: string) {
    const reservation = await this.oneForPlayer(userId, id);
    if (reservation.status !== 'CONFIRMED')
      throw new ConflictException({
        code: 'RESERVATION_NOT_ACTIVE',
        message: 'La reserva ya no está activa',
      });
    if (
      reservation.startAt.getTime() - Date.now() <
      reservation.club.cancellationHoursBefore * 3_600_000
    )
      throw new ConflictException({
        code: 'CANCELLATION_WINDOW_EXPIRED',
        message: 'El plazo para cancelar terminó',
      });
    const updated = await this.prisma.reservation.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByUserId: userId,
      },
    });
    if (!updated.count)
      throw new ConflictException({
        code: 'RESERVATION_NOT_ACTIVE',
        message: 'La reserva ya fue modificada',
      });
    return this.prisma.reservation.findUniqueOrThrow({
      where: { id },
      include: { club: true, court: true },
    });
  }
}
