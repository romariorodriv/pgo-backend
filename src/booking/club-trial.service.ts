import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClubRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from './availability.service';
import { ClubAccessService } from './club-access.service';
import { canReceiveBookings, ClubEntitlement, TRIAL_MS } from './club-entitlement';

type TrialClub = ClubEntitlement & { id: string };

@Injectable()
export class ClubTrialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly availability: AvailabilityService,
  ) {}

  private summary(club: TrialClub, role: ClubRole, ready: boolean, now = new Date()) {
    const state = club.status === 'SUSPENDED' || club.status === 'REJECTED'
      ? club.status
      : club.status !== 'APPROVED' ? 'WAITING_APPROVAL'
      : club.legacyAccess ? 'LEGACY'
      : club.trialStartedAt ? (canReceiveBookings(club, now) ? 'ACTIVE' : 'EXPIRED')
      : ready ? 'READY_TO_ACTIVATE' : 'CONFIGURATION_REQUIRED';
    return {
      clubId: club.id, state, serverNow: now,
      trialStartedAt: club.trialStartedAt ?? null, trialEndsAt: club.trialEndsAt ?? null,
      isPublished: club.isPublished === true,
      canReceiveBookings: canReceiveBookings(club, now),
      canActivate: role === ClubRole.OWNER && state === 'READY_TO_ACTIVATE',
      ready, trialHours: 168,
    };
  }

  private async ready(db: Prisma.TransactionClient, clubId: string, now: Date) {
    const durations = await db.allowedDuration.findMany({ where: { clubId, active: true } });
    const from = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const until = new Date(`${from}T12:00:00Z`);
    until.setUTCDate(until.getUTCDate() + 13);
    for (const duration of durations) {
      const slots = await this.availability.setupRange(db, clubId, from, until.toISOString().slice(0, 10), duration.minutes);
      // A trial only accepts commitments that finish during its 168 hours.
      if (slots.some(slot => slot.available && new Date(slot.endAt).getTime() <= now.getTime() + TRIAL_MS)) return true;
    }
    return false;
  }

  async status(userId: string, clubId: string) {
    const member = await this.access.membership(userId, clubId);
    const now = new Date();
    const ready = member.club.status === 'APPROVED' && !member.club.legacyAccess && !member.club.trialStartedAt
      ? await this.ready(this.prisma, clubId, now) : false;
    return this.summary(member.club, member.role, ready, now);
  }

  async activate(userId: string, clubId: string) {
    // Explicit club ID: no implicit selection or owner supplied by the client.
    await this.access.membership(userId, clubId, [ClubRole.OWNER]);
    return this.prisma.$transaction(async tx => {
      // Configuration uses this advisory lock for schedules/pricing as well.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${clubId}))::text`;
      await tx.$queryRaw`SELECT id FROM clubs WHERE id = ${clubId} FOR UPDATE`;
      const member = await tx.clubMember.findUnique({ where: { userId_clubId: { userId, clubId } } });
      if (!member || member.role !== ClubRole.OWNER) throw new ForbiddenException('Solo el propietario puede activar la prueba');
      const club = await tx.club.findUnique({ where: { id: clubId } });
      if (!club) throw new NotFoundException('Club no encontrado');
      if (club.status !== 'APPROVED') throw new ConflictException('El club debe estar aprobado antes de activar la prueba');
      const now = new Date();
      // Retrying, including after expiry, must return the same trial dates.
      if (club.legacyAccess || club.trialStartedAt) return this.summary(club, member.role, false, now);
      if (!await this.ready(tx, clubId, now)) throw new ConflictException({ code: 'CLUB_NOT_READY', message: 'Configura una cancha activa, horarios y tarifas que permitan una reserva durante los próximos siete días' });
      const updated = await tx.club.update({ where: { id: clubId }, data: {
        trialStartedAt: now,
        trialEndsAt: new Date(now.getTime() + TRIAL_MS),
        isPublished: true,
      } });
      return this.summary(updated, member.role, true, now);
    }, { maxWait: 5000, timeout: 30000 });
  }
}
