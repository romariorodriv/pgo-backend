import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no definida.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const args = new Set(process.argv.slice(2));
const apply = args.has('--confirm-production-cleanup');

async function counts() {
  const [
    users,
    profiles,
    tournaments,
    tournamentRegistrations,
    tournamentMatches,
    openMatchAlerts,
    openMatchParticipants,
    openMatchInvitations,
    openMatchCoordinationUpdates,
    matches,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.profile.count(),
    prisma.tournament.count(),
    prisma.tournamentRegistration.count(),
    prisma.tournamentMatch.count(),
    prisma.openMatchAlert.count(),
    prisma.openMatchParticipant.count(),
    prisma.openMatchInvitation.count(),
    prisma.openMatchCoordinationUpdate.count(),
    prisma.match.count(),
  ]);

  return {
    users,
    profiles,
    tournaments,
    tournamentRegistrations,
    tournamentMatches,
    openMatchAlerts,
    openMatchParticipants,
    openMatchInvitations,
    openMatchCoordinationUpdates,
    matches,
  };
}

async function main() {
  await prisma.$connect();

  const before = await counts();
  const alertResultMatches = await prisma.openMatchAlert.findMany({
    where: { resultMatchId: { not: null } },
    select: { resultMatchId: true },
  });
  const resultMatchIds = alertResultMatches
    .map((row) => row.resultMatchId)
    .filter((id): id is string => Boolean(id));

  const notificationIds = (
    await prisma.appNotification.findMany({
      where: {
        OR: [
          { type: { startsWith: 'TOURNAMENT_' } },
          { type: { startsWith: 'OPEN_MATCH_' } },
          { type: { startsWith: 'tournament_' } },
        ],
      },
      select: { id: true },
    })
  ).map((row) => row.id);

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    before,
    exclusiveResultMatches: resultMatchIds.length,
    derivedNotifications: notificationIds.length,
  }, null, 2));

  if (!apply) {
    console.log('Dry-run completado. No se hicieron cambios.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (notificationIds.length) {
      await tx.appNotification.deleteMany({
        where: { id: { in: notificationIds } },
      });
    }
    await tx.openMatchCoordinationUpdate.deleteMany({});
    await tx.openMatchInvitation.deleteMany({});
    await tx.openMatchParticipant.deleteMany({});
    await tx.openMatchAlert.deleteMany({});

    if (resultMatchIds.length) {
      await tx.matchParticipant.deleteMany({
        where: { matchId: { in: resultMatchIds } },
      });
      await tx.match.deleteMany({
        where: { id: { in: resultMatchIds } },
      });
    }

    await tx.tournamentMatch.deleteMany({});
    await tx.tournamentRegistration.deleteMany({});
    await tx.tournament.deleteMany({});
  });

  const after = await counts();
  console.log(JSON.stringify({ after }, null, 2));

  if (
    after.tournaments !== 0 ||
    after.tournamentRegistrations !== 0 ||
    after.tournamentMatches !== 0 ||
    after.openMatchAlerts !== 0 ||
    after.openMatchParticipants !== 0 ||
    after.openMatchInvitations !== 0 ||
    after.openMatchCoordinationUpdates !== 0
  ) {
    throw new Error('La limpieza terminó con registros autorizados pendientes.');
  }

  if (after.users !== before.users || after.profiles !== before.profiles) {
    throw new Error('La limpieza alteró usuarios o perfiles.');
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
