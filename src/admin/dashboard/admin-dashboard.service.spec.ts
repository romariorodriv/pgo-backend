import { BadRequestException } from '@nestjs/common';
import { AdminDashboardService } from './admin-dashboard.service';

const date = (iso: string) => new Date(iso);

describe('AdminDashboardService', () => {
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  const createService = (overrides: Record<string, jest.Mock> = {}) => {
    const repository = {
      countUsers: jest.fn().mockResolvedValue(0),
      countMatches: jest.fn().mockResolvedValue(0),
      countTournaments: jest.fn().mockResolvedValue(0),
      countRegistrations: jest.fn().mockResolvedValue(0),
      countUpcomingTournaments: jest.fn().mockResolvedValue(0),
      usersCreated: jest.fn().mockResolvedValue([]),
      matchesCreated: jest.fn().mockResolvedValue([]),
      openMatchesCreated: jest.fn().mockResolvedValue([]),
      tournamentsCreated: jest.fn().mockResolvedValue([]),
      tournamentRegistrationsCreated: jest.fn().mockResolvedValue([]),
      productActivityEvents: jest.fn().mockResolvedValue([]),
      tournamentsAttention: jest.fn().mockResolvedValue([]),
      recent: jest.fn().mockResolvedValue([[], [], [], [], []]),
      ...overrides,
    };
    return {
      repository,
      service: new AdminDashboardService(repository as never, audit as never),
    };
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(date('2026-07-31T17:00:00.000Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('groups activity by America/Lima day around midnight and fills empty days', async () => {
    const { service } = createService({
      usersCreated: jest.fn().mockResolvedValue([
        { id: 'u1', createdAt: date('2026-07-30T04:59:00.000Z') },
        { id: 'u2', createdAt: date('2026-07-30T05:00:00.000Z') },
      ]),
      matchesCreated: jest
        .fn()
        .mockResolvedValue([
          { id: 'm1', createdAt: date('2026-07-31T05:01:00.000Z') },
        ]),
      openMatchesCreated: jest
        .fn()
        .mockResolvedValue([
          { id: 'o1', createdAt: date('2026-07-31T05:01:00.000Z') },
        ]),
      tournamentsCreated: jest.fn().mockResolvedValue([]),
      tournamentRegistrationsCreated: jest.fn().mockResolvedValue([]),
      productActivityEvents: jest.fn().mockResolvedValue([
        { userId: 'u1', occurredAt: date('2026-07-30T04:59:00.000Z') },
        { userId: 'u1', occurredAt: date('2026-07-30T04:59:30.000Z') },
        { userId: 'u2', occurredAt: date('2026-07-30T05:00:00.000Z') },
      ]),
    });

    const rows = await service.activity(7);

    expect(rows).toHaveLength(7);
    expect(rows[0].date).toBe('2026-07-25');
    expect(rows.at(-1)?.date).toBe('2026-07-31');
    expect(rows.find((row) => row.date === '2026-07-29')).toMatchObject({
      registrations: 1,
      uniqueActiveUsers: 1,
    });
    expect(rows.find((row) => row.date === '2026-07-30')).toMatchObject({
      registrations: 1,
      uniqueActiveUsers: 1,
    });
    expect(rows.find((row) => row.date === '2026-07-31')).toMatchObject({
      matches: 1,
      openMatches: 1,
    });
    expect(rows.find((row) => row.date === '2026-07-25')).toMatchObject({
      registrations: 0,
      matches: 0,
      openMatches: 0,
      tournaments: 0,
      tournamentRegistrations: 0,
      uniqueActiveUsers: 0,
    });
  });

  it('rejects invalid days values', async () => {
    const { service } = createService();

    await expect(service.activity(8)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.funnel(Number.NaN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('calculates activation with mature cohorts and exact seven day boundary', async () => {
    const { service } = createService({
      usersCreated: jest.fn().mockResolvedValueOnce([
        { id: 'inside', createdAt: date('2026-07-01T10:00:00.000Z') },
        { id: 'edge', createdAt: date('2026-07-02T10:00:00.000Z') },
        { id: 'late', createdAt: date('2026-07-03T10:00:00.000Z') },
      ]),
      productActivityEvents: jest.fn().mockResolvedValueOnce([
        { userId: 'inside', occurredAt: date('2026-07-05T10:00:00.000Z') },
        { userId: 'edge', occurredAt: date('2026-07-09T10:00:00.000Z') },
        { userId: 'late', occurredAt: date('2026-07-10T10:00:01.000Z') },
      ]),
    });

    const rows = await service.funnel(30, date('2026-07-31T17:00:00.000Z'));

    expect(rows.find((row) => row.key === 'registered')?.value).toBe(3);
    expect(rows.find((row) => row.key === 'activated')?.value).toBe(2);
  });

  it('excludes immature users from activation cohort', async () => {
    const usersCreated = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'mature', createdAt: date('2026-07-20T10:00:00.000Z') },
      ]);
    const { service } = createService({
      usersCreated,
      productActivityEvents: jest.fn().mockResolvedValueOnce([
        { userId: 'mature', occurredAt: date('2026-07-22T10:00:00.000Z') },
        { userId: 'immature', occurredAt: date('2026-07-30T10:00:00.000Z') },
      ]),
    });

    const rows = await service.funnel(14, date('2026-07-31T17:00:00.000Z'));

    expect(usersCreated).toHaveBeenCalledWith(
      date('2026-07-17T05:00:00.000Z'),
      date('2026-07-24T05:00:00.000Z'),
    );
    expect(rows.find((row) => row.key === 'registered')?.value).toBe(1);
    expect(rows.find((row) => row.key === 'activated')?.value).toBe(1);
  });

  it('counts recurrence only across different Lima calendar days', async () => {
    const { service } = createService({
      usersCreated: jest.fn().mockResolvedValue([
        { id: 'same-day', createdAt: date('2026-07-01T10:00:00.000Z') },
        { id: 'two-days', createdAt: date('2026-07-01T10:00:00.000Z') },
      ]),
      productActivityEvents: jest.fn().mockResolvedValue([
        { userId: 'same-day', occurredAt: date('2026-07-05T10:00:00.000Z') },
        { userId: 'same-day', occurredAt: date('2026-07-05T11:00:00.000Z') },
        { userId: 'two-days', occurredAt: date('2026-07-05T10:00:00.000Z') },
        { userId: 'two-days', occurredAt: date('2026-07-06T05:00:00.000Z') },
      ]),
    });

    const rows = await service.funnel(30, date('2026-07-31T17:00:00.000Z'));

    expect(rows.find((row) => row.key === 'recurrent')?.value).toBe(1);
  });

  it('keeps funnel values monotonic and responses free of sensitive fields', async () => {
    const { service } = createService({
      usersCreated: jest
        .fn()
        .mockResolvedValue([
          { id: 'u1', createdAt: date('2026-07-01T10:00:00.000Z') },
        ]),
      productActivityEvents: jest.fn().mockResolvedValue([
        { userId: 'u1', occurredAt: date('2026-07-02T10:00:00.000Z') },
        { userId: 'external', occurredAt: date('2026-07-02T10:00:00.000Z') },
      ]),
    });

    const rows = await service.funnel(30, date('2026-07-31T17:00:00.000Z'));
    const values = rows.map((row) => row.value);

    expect(values).toEqual([1, 1, 1, 0]);
    expect(JSON.stringify(rows)).not.toMatch(
      /password|token|cookie|authorization/i,
    );
  });
});
