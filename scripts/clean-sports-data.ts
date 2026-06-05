import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';

type TableCount = { table: string; count: number };

loadEnvFile(resolve(process.cwd(), '.env'));
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no definida en el entorno actual.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs() {
  const npmArgv = (() => {
    const raw = process.env.npm_config_argv;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as {
        original?: string[];
        cooked?: string[];
      };
      return [...(parsed.original ?? []), ...(parsed.cooked ?? [])];
    } catch {
      return [];
    }
  })();
  const args = new Set([...process.argv.slice(2), ...npmArgv]);
  const npmApply = process.env.npm_config_apply === 'true';
  const npmDryRun = process.env.npm_config_dry_run === 'true';
  return {
    dryRun:
      args.has('--dry-run') ||
      npmDryRun ||
      (!args.has('--apply') && !npmApply),
    apply: args.has('--apply') || npmApply,
    allowProduction:
      args.has('--allow-production') || process.env.npm_config_allow_production === 'true',
  };
}

function isLikelyLocalDatabase(url?: string | null) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.startsWith('172.16.') ||
      host.startsWith('172.17.') ||
      host.startsWith('172.18.') ||
      host.startsWith('172.19.') ||
      host.startsWith('172.2') ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

function dedupe(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function countTable(table: string, count: number): Promise<TableCount> {
  return { table, count };
}

async function main() {
  const { dryRun, apply, allowProduction } = parseArgs();
  const databaseUrl = process.env.DATABASE_URL ?? null;
  const local = isLikelyLocalDatabase(databaseUrl);

  if (!databaseUrl) {
    throw new Error('DATABASE_URL no definida');
  }

  if (!local && !allowProduction) {
    console.log('Entorno detectado: PRODUCCION/EXTERNO');
    console.log('Abortado. Usa --allow-production solo con confirmacion explicita.');
    process.exit(1);
  }

  console.log(`Entorno detectado: ${local ? 'LOCAL/DEV' : 'PRODUCCION/EXTERNO'}`);
  console.log(`Modo: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  await prisma.$connect();

  const [
    tournaments,
    tournamentRegistrations,
    tournamentMatches,
    openMatchAlerts,
    openMatchParticipants,
    openMatchCoordinationUpdates,
    matches,
    matchParticipants,
    notifications,
    profilesToReset,
  ] = await Promise.all([
    prisma.tournament.count(),
    prisma.tournamentRegistration.count(),
    prisma.tournamentMatch.count(),
    prisma.openMatchAlert.count(),
    prisma.openMatchParticipant.count(),
    prisma.openMatchCoordinationUpdate.count(),
    prisma.match.count(),
    prisma.matchParticipant.count(),
    prisma.appNotification.count({
      where: {
        OR: [
          { type: { startsWith: 'TOURNAMENT_' } },
          { type: { startsWith: 'MATCH_' } },
          { type: { startsWith: 'OPEN_MATCH_' } },
          { type: { startsWith: 'tournament_' } },
          { type: 'XP_GAINED' },
        ],
      },
    }),
    prisma.profile.findMany({
      where: {
        OR: [
          { experiencePoints: { gt: 0 } },
          { wins: { gt: 0 } },
          { weeklyStreak: { gt: 0 } },
          { rankingPosition: { gt: 0 } },
        ],
      },
      select: {
        userId: true,
      },
    }),
  ]);

  const affectedUsers = dedupe([
    ...(await prisma.tournament.findMany({ select: { createdById: true } })).map(
      (row) => row.createdById,
    ),
    ...(await prisma.tournamentRegistration.findMany({
      select: { userId: true, partnerUserId: true },
    })).flatMap((row) => [row.userId, row.partnerUserId]),
    ...(await prisma.match.findMany({ select: { createdById: true } })).map(
      (row) => row.createdById,
    ),
    ...(await prisma.matchParticipant.findMany({ select: { userId: true } })).map(
      (row) => row.userId,
    ),
    ...(await prisma.openMatchAlert.findMany({
      select: { organizerId: true },
    })).map((row) => row.organizerId),
    ...(await prisma.openMatchParticipant.findMany({
      select: { userId: true },
    })).map((row) => row.userId),
    ...(await prisma.openMatchCoordinationUpdate.findMany({
      select: { userId: true },
    })).map((row) => row.userId),
    ...(await prisma.appNotification.findMany({
      where: {
        OR: [
          { type: { startsWith: 'TOURNAMENT_' } },
          { type: { startsWith: 'MATCH_' } },
          { type: { startsWith: 'OPEN_MATCH_' } },
          { type: { startsWith: 'tournament_' } },
          { type: 'XP_GAINED' },
        ],
      },
      select: { userId: true },
    })).map((row) => row.userId),
    ...profilesToReset.map((row) => row.userId),
  ]);

  const summary: TableCount[] = [
    await countTable('tournaments', tournaments),
    await countTable('tournamentRegistrations', tournamentRegistrations),
    await countTable('tournamentMatches', tournamentMatches),
    await countTable('openMatchAlerts', openMatchAlerts),
    await countTable('openMatchParticipants', openMatchParticipants),
    await countTable('openMatchCoordinationUpdates', openMatchCoordinationUpdates),
    await countTable('matches', matches),
    await countTable('matchParticipants', matchParticipants),
    await countTable('appNotifications(sports)', notifications),
    await countTable('profilesToReset', profilesToReset.length),
  ];

  console.log('\nResumen dry-run:');
  for (const item of summary) {
    console.log(`- ${item.table}: ${item.count}`);
  }
  console.log(`- totalUsuariosAfectados: ${affectedUsers.length}`);

  if (dryRun && !apply) {
    console.log('\nDry-run completado. No se hicieron cambios.');
    await prisma.$disconnect();
    return;
  }

  const sportsNotificationTypes = [
    { type: { startsWith: 'TOURNAMENT_' } },
    { type: { startsWith: 'MATCH_' } },
    { type: { startsWith: 'OPEN_MATCH_' } },
    { type: { startsWith: 'tournament_' } },
    { type: 'XP_GAINED' },
  ] satisfies Prisma.AppNotificationWhereInput[];

  await prisma.$transaction(async (tx) => {
    await tx.appNotification.deleteMany({ where: { OR: sportsNotificationTypes } });
    await tx.openMatchCoordinationUpdate.deleteMany({});
    await tx.openMatchParticipant.deleteMany({});
    await tx.openMatchAlert.deleteMany({});
    await tx.matchParticipant.deleteMany({});
    await tx.match.deleteMany({});
    await tx.tournamentMatch.deleteMany({});
    await tx.tournamentRegistration.deleteMany({});
    await tx.tournament.deleteMany({});
    await tx.profile.updateMany({
      where: {
        OR: [
          { experiencePoints: { gt: 0 } },
          { wins: { gt: 0 } },
          { weeklyStreak: { gt: 0 } },
          { rankingPosition: { gt: 0 } },
        ],
      },
      data: {
        experiencePoints: 0,
        wins: 0,
        weeklyStreak: 0,
        rankingPosition: 0,
      },
    });
  });

  const [afterTournaments, afterOpenMatches, afterMatches] = await Promise.all([
    prisma.tournament.count(),
    prisma.openMatchAlert.count(),
    prisma.match.count(),
  ]);

  console.log('\nPost-apply:');
  console.log(`- tournaments: ${afterTournaments}`);
  console.log(`- openMatchAlerts: ${afterOpenMatches}`);
  console.log(`- matches: ${afterMatches}`);
  console.log('- profiles stats deportivos reseteados a 0');
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
