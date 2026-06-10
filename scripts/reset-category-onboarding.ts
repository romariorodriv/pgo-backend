import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type Mode = 'dry-run' | 'apply';
type EnvName = 'local' | 'dev' | 'staging' | 'production';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no esta definida en el entorno actual.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const demoEmailHints = [
  'demo_',
  '@pgo.test',
];

const resetCategoryFields = {
  category: null,
  categoryOrigin: null,
  categoryIsProvisional: false,
  categorySuggested: null,
  categoryPreliminary: null,
  categoryMaxApplied: null,
  categoryScore: null,
  categoryQuizAnswers: Prisma.DbNull,
  hasCompletedInitialOnboarding: false,
};

function parseArgs(argv: string[]) {
  let mode: Mode = 'dry-run';
  let env: EnvName | undefined;
  let allowProduction = false;

  for (const arg of argv) {
    if (arg === '--apply') mode = 'apply';
    if (arg === '--dry-run') mode = 'dry-run';
    if (arg.startsWith('--env=')) {
      env = arg.split('=')[1] as EnvName;
    }
    if (arg === '--allow-production') {
      allowProduction = true;
    }
  }

  return { mode, env, allowProduction };
}

function inferEnvFromUrl(url: string): EnvName {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(host)) return 'local';
    if (host.includes('staging')) return 'staging';
    if (host.includes('dev')) return 'dev';
    return 'production';
  } catch {
    return 'production';
  }
}

function isDemoUser(email: string) {
  const lower = email.toLowerCase();
  return demoEmailHints.some((hint) => lower.includes(hint));
}

function summarizeEmails(emails: string[]) {
  return emails.length <= 10 ? emails.join(', ') : `${emails.slice(0, 10).join(', ')}... (+${emails.length - 10})`;
}

async function main() {
  const { mode, env, allowProduction } = parseArgs(process.argv.slice(2));
  const inferredEnv = inferEnvFromUrl(connectionString!);
  const effectiveEnv = env ?? inferredEnv;

  if (effectiveEnv === 'production' && !allowProduction) {
    throw new Error('Abortado: entorno production requiere --allow-production.');
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const demoUsers = users.filter((user) => isDemoUser(user.email));
  const nonDemoUsers = users.filter((user) => !isDemoUser(user.email));
  const demoUserIds = demoUsers.map((user) => user.id);
  const nonDemoUserIds = nonDemoUsers.map((user) => user.id);

  const resetCandidates = await prisma.profile.findMany({
    where: {
      userId: { in: nonDemoUserIds },
      OR: [
        { category: { not: null } },
        { categoryOrigin: { not: null } },
        { categorySuggested: { not: null } },
        { categoryPreliminary: { not: null } },
        { categoryMaxApplied: { not: null } },
        { categoryScore: { not: null } },
        { categoryQuizAnswers: { not: Prisma.DbNull } },
        { hasCompletedInitialOnboarding: true },
      ],
    },
    select: {
      userId: true,
    },
  });

  const demoMatches = await prisma.match.count({
    where: {
      OR: [
        { createdById: { in: demoUserIds } },
        { participants: { some: { userId: { in: demoUserIds } } } },
      ],
    },
  });

  const demoTournaments = await prisma.tournament.count({
    where: {
      OR: [
        { createdById: { in: demoUserIds } },
        { title: { startsWith: '[DEMO] ' } },
      ],
    },
  });

  const demoRegistrations = await prisma.tournamentRegistration.count({
    where: {
      OR: [
        { userId: { in: demoUserIds } },
        { partnerUserId: { in: demoUserIds } },
        { tournament: { createdById: { in: demoUserIds } } },
      ],
    },
  });

  const demoProfileCount = await prisma.profile.count({
    where: { userId: { in: demoUserIds } },
  });

  console.log(`ENV detectado: ${effectiveEnv} (DATABASE_URL -> ${inferredEnv})`);
  console.log(`Modo: ${mode}`);
  console.log(`Usuarios demo encontrados: ${demoUsers.length}`);
  console.log(`Usuarios no-demo encontrados: ${nonDemoUsers.length}`);
  console.log(`Perfiles no-demo a resetear: ${resetCandidates.length}`);
  console.log(`Demo users a borrar: ${demoUsers.length} | perfiles demo: ${demoProfileCount} | matches demo: ${demoMatches} | torneos demo: ${demoTournaments} | registrations demo: ${demoRegistrations}`);
  console.log(`Demo emails: ${summarizeEmails(demoUsers.map((u) => u.email)) || 'ninguno'}`);
  console.log(`Reset candidates: ${summarizeEmails(resetCandidates.map((u) => u.userId)) || 'ninguno'}`);

  if (mode === 'dry-run') {
    console.log('Dry-run completado. No se realizaron cambios.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (demoUserIds.length > 0) {
      await tx.matchParticipant.deleteMany({
        where: { userId: { in: demoUserIds } },
      });

      await tx.tournamentRegistration.deleteMany({
        where: {
          OR: [
            { userId: { in: demoUserIds } },
            { partnerUserId: { in: demoUserIds } },
            { tournament: { createdById: { in: demoUserIds } } },
          ],
        },
      });

      await tx.match.deleteMany({
        where: { createdById: { in: demoUserIds } },
      });

      await tx.tournament.deleteMany({
        where: {
          OR: [
            { createdById: { in: demoUserIds } },
            { title: { startsWith: '[DEMO] ' } },
          ],
        },
      });

      await tx.profile.deleteMany({
        where: { userId: { in: demoUserIds } },
      });

      await tx.user.deleteMany({
        where: { id: { in: demoUserIds } },
      });
    }

    if (nonDemoUserIds.length > 0) {
      await tx.profile.updateMany({
        where: {
          userId: { in: nonDemoUserIds },
        },
        data: resetCategoryFields,
      });
    }
  });

  console.log(`Usuarios demo eliminados: ${demoUsers.length}`);
  console.log(`Usuarios no-demo reseteados: ${resetCandidates.length}`);
  console.log('Reset category onboarding completado.');
}

main()
  .catch((error) => {
    console.error('reset:category-onboarding failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
