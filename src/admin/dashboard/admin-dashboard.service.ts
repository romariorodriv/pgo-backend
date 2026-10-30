import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdminRole } from '@prisma/client';
import { AdminAuditService } from '../audit/admin-audit.service';
import type { RequestMeta } from '../auth/admin-auth.types';
import { AdminDashboardRepository } from './admin-dashboard.repository';
import type {
  ActivityPoint,
  Metric,
  ProductActivityEvent,
} from './admin-dashboard.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const ALLOWED_DAYS = new Set([7, 14, 30, 60, 90]);

type CohortUser = { id: string; createdAt: Date };
type DateRow = { createdAt: Date };

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly repository: AdminDashboardRepository,
    private readonly audit: AdminAuditService,
  ) {}

  async summary(admin: { id: string; role: AdminRole }, meta: RequestMeta) {
    const now = new Date();
    const [from7, from30, prev7, prev30] = [
      this.daysAgo(7, now),
      this.daysAgo(30, now),
      this.daysAgo(14, now),
      this.daysAgo(60, now),
    ];
    const [
      totalUsers,
      new7,
      prevNew7,
      new30,
      prevNew30,
      matches30,
      prevMatches30,
      tournaments30,
      prevTournaments30,
      registrations30,
      prevRegistrations30,
      upcoming,
      attention,
      active7,
      previousActive7,
      active30,
      previousActive30,
      recurrent7,
      previousRecurrent7,
      recurrent30,
      previousRecurrent30,
      activation,
      funnel,
    ] = await Promise.all([
      this.repository.countUsers(),
      this.repository.countUsers(from7, now),
      this.repository.countUsers(prev7, from7),
      this.repository.countUsers(from30, now),
      this.repository.countUsers(prev30, from30),
      this.repository.countMatches(from30, now),
      this.repository.countMatches(prev30, from30),
      this.repository.countTournaments(from30, now),
      this.repository.countTournaments(prev30, from30),
      this.repository.countRegistrations(from30, now),
      this.repository.countRegistrations(prev30, from30),
      this.repository.countUpcomingTournaments(now),
      this.tournamentsAttention(),
      this.productActivityMetric(7, now),
      this.productActivityMetric(7, from7),
      this.productActivityMetric(30, now),
      this.productActivityMetric(30, from30),
      this.recurrentMetric(7, now),
      this.recurrentMetric(7, from7),
      this.recurrentMetric(30, now),
      this.recurrentMetric(30, from30),
      this.activationRate(30, now),
      this.funnel(30, now),
    ]);
    await this.audit.log({
      adminUserId: admin.id,
      action: 'ADMIN_DASHBOARD_ACCESS',
      metadata: { endpoint: 'summary', role: admin.role },
      ...meta,
    });
    return {
      totalUsers: this.metric(
        totalUsers,
        undefined,
        'Usuarios activos totales.',
        'No incluye usuarios desactivados.',
      ),
      newUsers7d: this.metric(
        new7,
        prevNew7,
        'Usuarios activos creados en los ultimos 7 dias.',
        'Comparado contra los 7 dias anteriores.',
      ),
      newUsers30d: this.metric(
        new30,
        prevNew30,
        'Usuarios activos creados en los ultimos 30 dias.',
        'Comparado contra los 30 dias anteriores.',
      ),
      activeProductUsers7d: this.metric(
        active7,
        previousActive7,
        'Usuarios unicos que crean o participan en partidos, partidos abiertos o torneos.',
        'No mide sesiones ni aperturas de app.',
      ),
      activeProductUsers30d: this.metric(
        active30,
        previousActive30,
        'Usuarios unicos con actividad de producto en 30 dias.',
        'No mide sesiones ni aperturas de app.',
      ),
      recurrentUsers7d: this.metric(
        recurrent7,
        previousRecurrent7,
        'Usuarios con actividad valida en al menos dos dias calendario Lima diferentes.',
        'Dos acciones el mismo dia cuentan como un solo dia activo.',
      ),
      recurrentUsers30d: this.metric(
        recurrent30,
        previousRecurrent30,
        'Usuarios recurrentes en 30 dias.',
        'Dos acciones el mismo dia cuentan como un solo dia activo.',
      ),
      matches30d: this.metric(
        matches30,
        prevMatches30,
        'Partidos no cancelados creados en 30 dias.',
      ),
      tournaments30d: this.metric(
        tournaments30,
        prevTournaments30,
        'Torneos no cancelados creados en 30 dias.',
      ),
      registrations30d: this.metric(
        registrations30,
        prevRegistrations30,
        'Inscripciones no canceladas en torneos no cancelados en 30 dias.',
      ),
      upcomingTournaments: this.metric(
        upcoming,
        undefined,
        'Torneos publicados proximos.',
      ),
      tournamentsNeedingAttention: this.metric(
        attention.length,
        undefined,
        'Torneos proximos con baja ocupacion, cero inscritos o casi llenos.',
      ),
      activationRate: activation,
      funnel30d: funnel,
    };
  }

  async activity(days: number): Promise<ActivityPoint[]> {
    const safeDays = this.validateDays(days);
    const { from, to } = this.limaWindowEndingToday(safeDays);
    const points = this.emptyActivityPoints(from, safeDays);
    const map = new Map(points.map((point) => [point.date, point]));
    const [
      users,
      matches,
      openMatches,
      tournaments,
      tournamentRegistrations,
      activityEvents,
    ] = await Promise.all([
      this.repository.usersCreated(from, to),
      this.repository.matchesCreated(from, to),
      this.repository.openMatchesCreated(from, to),
      this.repository.tournamentsCreated(from, to),
      this.repository.tournamentRegistrationsCreated(from, to),
      this.repository.productActivityEvents(from, to),
    ]);

    this.incrementByDate(users, map, 'registrations');
    this.incrementByDate(matches, map, 'matches');
    this.incrementByDate(openMatches, map, 'openMatches');
    this.incrementByDate(tournaments, map, 'tournaments');
    this.incrementByDate(
      tournamentRegistrations,
      map,
      'tournamentRegistrations',
    );

    const activeByDate = new Map<string, Set<string>>();
    for (const event of activityEvents) {
      const date = this.limaLabel(event.occurredAt);
      if (!map.has(date)) continue;
      const ids = activeByDate.get(date) ?? new Set<string>();
      ids.add(event.userId);
      activeByDate.set(date, ids);
    }
    for (const [date, ids] of activeByDate) {
      const point = map.get(date);
      if (point) point.uniqueActiveUsers = ids.size;
    }
    return points;
  }

  async funnel(days: number, now = new Date()) {
    const safeDays = this.validateDays(days);
    const { from, to } = this.limaRollingWindow(safeDays, now);
    const cohortEnd = this.matureCohortEnd(to);
    if (cohortEnd <= from) return this.emptyFunnel('No hay cohorte madura.');

    const cohort = await this.repository.usersCreated(from, cohortEnd);
    const events = await this.repository.productActivityEvents(
      from,
      this.addDays(cohortEnd, 7),
    );
    const cohortIds = new Set(cohort.map((user) => user.id));
    const activatedIds = this.activatedUserIds(cohort, events);
    const participatedIds = this.uniqueEventUserIds(events, cohortIds);
    for (const userId of [...participatedIds]) {
      if (!activatedIds.has(userId)) participatedIds.delete(userId);
    }
    const recurrentIds = this.recurrentUserIds(events, participatedIds);
    return this.funnelRows(
      cohort.length,
      activatedIds.size,
      participatedIds.size,
      recurrentIds.size,
    );
  }

  async tournamentsAttention() {
    const rows = await this.repository.tournamentsAttention(
      new Date(),
      this.daysAgo(-7),
    );
    return rows
      .map((tournament) => {
        const registrations = tournament.registrations.length;
        const capacity = tournament.playerCapacity || null;
        const occupancy = capacity
          ? Math.round((registrations / capacity) * 100)
          : null;
        const alert =
          capacity == null
            ? ['CAPACITY_MISSING', 'Capacidad no configurada']
            : registrations === 0
              ? ['ZERO_REGISTRATIONS', 'Sin inscritos']
              : occupancy !== null && occupancy < 50
                ? ['LOW_OCCUPANCY', 'Ocupacion inferior al 50%']
                : occupancy !== null && occupancy > 85
                  ? ['ALMOST_FULL', 'Casi completo']
                  : tournament.status === 'DRAFT'
                    ? ['INCONSISTENT_STATUS', 'Fecha proxima y estado borrador']
                    : null;
        if (!alert) return null;
        return {
          id: tournament.id,
          title: tournament.title,
          organizerName: tournament.createdBy.name,
          startsAt: tournament.startsAt.toISOString(),
          category: tournament.category,
          location: tournament.location,
          registrations,
          capacity,
          occupancyPercentage: occupancy,
          alertType: alert[0],
          alertLabel: alert[1],
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, 10);
  }

  async recentActivity(limit: number) {
    const safeLimit = Math.min(50, Math.max(1, limit || 20));
    const [users, matches, tournaments, registrations, openMatches] =
      await this.repository.recent(safeLimit);
    return [
      ...users.map((u) =>
        this.event(
          `user:${u.id}`,
          'USER_REGISTERED',
          u.createdAt,
          'Usuario registrado',
          u.name,
          { id: u.id, name: u.name },
          { id: u.id, type: 'USER' },
        ),
      ),
      ...matches.map((m) =>
        this.event(
          `match:${m.id}`,
          'MATCH_CREATED',
          m.createdAt,
          'Partido creado',
          m.clubName,
          m.createdBy,
          { id: m.id, type: 'MATCH' },
        ),
      ),
      ...tournaments.map((t) =>
        this.event(
          `tournament:${t.id}`,
          'TOURNAMENT_CREATED',
          t.createdAt,
          'Torneo creado',
          t.title,
          t.createdBy,
          { id: t.id, type: 'TOURNAMENT' },
        ),
      ),
      ...registrations.map((r) =>
        this.event(
          `registration:${r.id}`,
          'TOURNAMENT_REGISTRATION_CREATED',
          r.createdAt,
          'Inscripcion creada',
          r.tournament.title,
          r.user,
          { id: r.id, type: 'TOURNAMENT_REGISTRATION' },
        ),
      ),
      ...openMatches.map((o) =>
        this.event(
          `open-match:${o.id}`,
          'OPEN_MATCH_CREATED',
          o.createdAt,
          'Partido abierto creado',
          o.club,
          o.organizer,
          { id: o.id, type: 'OPEN_MATCH' },
        ),
      ),
    ]
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, safeLimit);
  }

  private async productActivityMetric(days: number, endingAt: Date) {
    const from = this.daysAgo(days, endingAt);
    const to = endingAt;
    const events = await this.repository.productActivityEvents(from, to);
    return this.uniqueEventUserIds(events).size;
  }

  private async recurrentMetric(days: number, endingAt: Date) {
    const from = this.daysAgo(days, endingAt);
    const to = endingAt;
    const events = await this.repository.productActivityEvents(from, to);
    return this.recurrentUserIds(events).size;
  }

  private async activationRate(days: number, now: Date): Promise<Metric> {
    const current = await this.activationRateForWindow(days, now);
    const previous = await this.activationRateForWindow(
      days,
      this.daysAgo(days, now),
    );
    if (!current.available) return current;
    const percentagePointChange = previous.available
      ? current.value - previous.value
      : undefined;
    return {
      ...current,
      previousValue: previous.available ? previous.value : undefined,
      percentagePointChange,
      trend:
        percentagePointChange === undefined || percentagePointChange === 0
          ? 'neutral'
          : percentagePointChange > 0
            ? 'up'
            : 'down',
    };
  }

  private async activationRateForWindow(
    days: number,
    endingAt: Date,
  ): Promise<Metric> {
    const { from, to } = this.limaRollingWindow(days, endingAt);
    const cohortEnd = this.matureCohortEnd(to);
    if (cohortEnd <= from)
      return { available: false, reason: 'No hay cohorte madura.' };
    const cohort = await this.repository.usersCreated(from, cohortEnd);
    if (cohort.length === 0)
      return {
        available: false,
        reason: 'No hay usuarios registrados en cohortes maduras.',
      };
    const events = await this.repository.productActivityEvents(
      from,
      this.addDays(cohortEnd, 7),
    );
    const activated = this.activatedUserIds(cohort, events).size;
    return {
      available: true,
      value: Math.round((activated / cohort.length) * 100),
      trend: 'neutral',
      definition:
        'Porcentaje de usuarios de cohortes maduras con primera actividad valida dentro de los 7 dias posteriores al registro.',
      limitation:
        'Excluye usuarios registrados hace menos de 7 dias y no mide sesiones.',
    };
  }

  private activatedUserIds(
    cohort: CohortUser[],
    events: ProductActivityEvent[],
  ) {
    const eventsByUser = this.eventsByUser(events);
    const activated = new Set<string>();
    for (const user of cohort) {
      const windowEnd = this.addDays(user.createdAt, 7);
      const firstAction = (eventsByUser.get(user.id) ?? [])
        .filter(
          (event) =>
            event.occurredAt >= user.createdAt && event.occurredAt <= windowEnd,
        )
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0];
      if (firstAction) activated.add(user.id);
    }
    return activated;
  }

  private recurrentUserIds(
    events: ProductActivityEvent[],
    allowedUserIds?: Set<string>,
  ) {
    const daysByUser = new Map<string, Set<string>>();
    for (const event of events) {
      if (allowedUserIds && !allowedUserIds.has(event.userId)) continue;
      const days = daysByUser.get(event.userId) ?? new Set<string>();
      days.add(this.limaLabel(event.occurredAt));
      daysByUser.set(event.userId, days);
    }
    return new Set(
      [...daysByUser.entries()]
        .filter(([, days]) => days.size >= 2)
        .map(([userId]) => userId),
    );
  }

  private uniqueEventUserIds(
    events: ProductActivityEvent[],
    allowedUserIds?: Set<string>,
  ) {
    const ids = new Set<string>();
    for (const event of events) {
      if (!allowedUserIds || allowedUserIds.has(event.userId)) {
        ids.add(event.userId);
      }
    }
    return ids;
  }

  private eventsByUser(events: ProductActivityEvent[]) {
    const map = new Map<string, ProductActivityEvent[]>();
    for (const event of events) {
      const existing = map.get(event.userId) ?? [];
      existing.push(event);
      map.set(event.userId, existing);
    }
    return map;
  }

  private funnelRows(
    registered: number,
    activated: number,
    participated: number,
    recurrent: number,
  ) {
    const rows = [
      {
        key: 'registered',
        label: 'Registrados',
        value: registered,
        definition: 'Usuarios registrados en la cohorte madura del periodo.',
      },
      {
        key: 'activated',
        label: 'Activados',
        value: Math.min(activated, registered),
        definition:
          'Usuarios con primera actividad valida dentro de sus primeros 7 dias.',
      },
      {
        key: 'participated',
        label: 'Participaron',
        value: Math.min(participated, activated, registered),
        definition:
          'Usuarios activados con actividad valida de producto en el periodo.',
      },
      {
        key: 'recurrent',
        label: 'Recurrentes',
        value: Math.min(recurrent, participated, activated, registered),
        definition:
          'Usuarios participantes con actividad en al menos dos dias calendario Lima diferentes.',
      },
    ];
    return rows.map((row, index) => ({
      ...row,
      conversionFromPrevious:
        index === 0 ? null : this.percent(row.value, rows[index - 1].value),
      conversionFromStart: this.percent(row.value, registered),
    }));
  }

  private emptyFunnel(reason: string) {
    return this.funnelRows(0, 0, 0, 0).map((row) => ({
      ...row,
      limitation: reason,
    }));
  }

  private metric(
    value: number,
    previousValue: number | undefined,
    definition: string,
    limitation?: string,
  ): Metric {
    const percentageChange =
      previousValue === undefined || previousValue === 0
        ? undefined
        : Math.round(((value - previousValue) / previousValue) * 100);
    return {
      available: true,
      value,
      previousValue,
      percentageChange,
      trend:
        percentageChange === undefined || percentageChange === 0
          ? 'neutral'
          : percentageChange > 0
            ? 'up'
            : 'down',
      definition,
      limitation,
    };
  }

  private incrementByDate(
    rows: DateRow[],
    map: Map<string, ActivityPoint>,
    key: keyof Omit<ActivityPoint, 'date'>,
  ) {
    for (const row of rows) {
      const point = map.get(this.limaLabel(row.createdAt));
      if (point) point[key] += 1;
    }
  }

  private emptyActivityPoints(from: Date, days: number): ActivityPoint[] {
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(from.getTime() + index * DAY_MS);
      return {
        date: this.limaLabel(date),
        registrations: 0,
        matches: 0,
        openMatches: 0,
        tournaments: 0,
        tournamentRegistrations: 0,
        uniqueActiveUsers: 0,
      };
    });
  }

  private validateDays(days: number) {
    if (!Number.isInteger(days) || !ALLOWED_DAYS.has(days)) {
      throw new BadRequestException('days must be one of 7, 14, 30, 60 or 90');
    }
    return days;
  }

  private percent(value: number, previous: number) {
    return previous > 0 ? Math.round((value / previous) * 100) : null;
  }

  private daysAgo(days: number, from = new Date()) {
    return new Date(from.getTime() - days * DAY_MS);
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * DAY_MS);
  }

  private limaWindowEndingToday(days: number) {
    const todayStart = this.limaDayStart(new Date());
    const from = this.addDays(todayStart, -(days - 1));
    const to = this.addDays(todayStart, 1);
    return { from, to };
  }

  private limaRollingWindow(days: number, endingAt: Date) {
    const to = this.limaDayStart(endingAt);
    return { from: this.addDays(to, -days), to };
  }

  private matureCohortEnd(to: Date) {
    return this.addDays(to, -7);
  }

  private limaDayStart(date: Date) {
    const limaTime = date.getTime() - LIMA_OFFSET_MS;
    const days = Math.floor(limaTime / DAY_MS);
    return new Date(days * DAY_MS + LIMA_OFFSET_MS);
  }

  private limaLabel(date: Date) {
    return new Date(date.getTime() - LIMA_OFFSET_MS).toISOString().slice(0, 10);
  }

  private event(
    id: string,
    type: string,
    occurredAt: Date,
    title: string,
    description: string,
    actor: { id: string; name: string } | null,
    entity: { id: string; type: string },
  ) {
    return {
      id,
      type,
      occurredAt: occurredAt.toISOString(),
      title,
      description,
      actor: actor ? { id: actor.id, displayName: actor.name } : null,
      entity,
    };
  }
}
