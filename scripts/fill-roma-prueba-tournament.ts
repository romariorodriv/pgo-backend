import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient, Prisma, TournamentRegistrationMode, TournamentRegistrationStatus, ExperienceLevel } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no esta definida en el entorno actual.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ADMIN_EMAIL = 'tomascastmros@gmail.com';
const TARGET_TOURNAMENT_NAME = 'Roma prueba';
const TARGET_TOTAL = 16;
const DEMO_PASSWORD = 'Demo12345*';
const DEMO_CATEGORY = '4ta categoria';
const DEMO_CLUB = 'One Padel Olguin';
const DEMO_SIDE = 'Ambos';
const DEMO_EXPERIENCE = ExperienceLevel.INTERMEDIATE;

const demoEmails = Array.from({ length: TARGET_TOTAL }, (_, i) =>
  `demo.roma.prueba.${String(i + 1).padStart(2, '0')}@pgo.local`,
);

function norm(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function isProductionEnv() {
  const env = `${process.env.NODE_ENV ?? ''} ${process.env.DATABASE_URL ?? ''}`.toLowerCase();
  return env.includes('prod') || env.includes('production');
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function findAdmin() {
  return prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, name: true },
  });
}

async function findTournament(adminId: string) {
  const tournaments = await prisma.tournament.findMany({
    where: { createdById: adminId },
    select: {
      id: true,
      title: true,
      createdById: true,
      playerCapacity: true,
      status: true,
      registrationsOpen: true,
      registrations: {
        select: { id: true, userId: true, partnerUserId: true, status: true, mode: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const exact = tournaments.filter((t) => norm(t.title) === norm(TARGET_TOURNAMENT_NAME));
  if (exact.length === 1) return { tournament: exact[0], all: tournaments };

  const similar = tournaments.filter((t) => {
    const title = norm(t.title);
    const target = norm(TARGET_TOURNAMENT_NAME);
    return title.includes(target) || target.includes(title);
  });

  if (exact.length > 1 || similar.length > 1) {
    return { tournament: null, all: tournaments, ambiguous: true };
  }

  return { tournament: exact[0] ?? similar[0] ?? null, all: tournaments };
}

async function ensureDemoUser(tx: Prisma.TransactionClient, index: number) {
  const email = demoEmails[index];
  const name = `Demo Roma ${String(index + 1).padStart(2, '0')}`;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await tx.user.upsert({
    where: { email },
    create: {
      name,
      email,
      passwordHash,
      allowMatchInvites: true,
      profile: {
        create: {
          category: DEMO_CATEGORY,
          categoryOrigin: 'manual',
          categoryIsProvisional: false,
          categorySuggested: DEMO_CATEGORY,
          categoryPreliminary: DEMO_CATEGORY,
          categoryMaxApplied: DEMO_CATEGORY,
          categoryScore: 0,
          categoryQuizAnswers: Prisma.JsonNull,
          hasCompletedInitialOnboarding: true,
          preferredClub: DEMO_CLUB,
          preferredSide: DEMO_SIDE,
          experienceLevel: DEMO_EXPERIENCE,
        },
      },
    },
    update: {
      name,
      allowMatchInvites: true,
      profile: {
        upsert: {
          create: {
            category: DEMO_CATEGORY,
            categoryOrigin: 'manual',
            categoryIsProvisional: false,
            categorySuggested: DEMO_CATEGORY,
            categoryPreliminary: DEMO_CATEGORY,
            categoryMaxApplied: DEMO_CATEGORY,
            categoryScore: 0,
            categoryQuizAnswers: Prisma.JsonNull,
            hasCompletedInitialOnboarding: true,
            preferredClub: DEMO_CLUB,
            preferredSide: DEMO_SIDE,
            experienceLevel: DEMO_EXPERIENCE,
          },
          update: {
            category: DEMO_CATEGORY,
            categoryOrigin: 'manual',
            categoryIsProvisional: false,
            categorySuggested: DEMO_CATEGORY,
            categoryPreliminary: DEMO_CATEGORY,
            categoryMaxApplied: DEMO_CATEGORY,
            categoryScore: 0,
            categoryQuizAnswers: Prisma.JsonNull,
            hasCompletedInitialOnboarding: true,
            preferredClub: DEMO_CLUB,
            preferredSide: DEMO_SIDE,
            experienceLevel: DEMO_EXPERIENCE,
          },
        },
      },
    },
    select: { id: true, email: true },
  });

  return user;
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const apply = hasFlag('--apply');
  const allowProduction = hasFlag('--allow-production');

  const production = isProductionEnv();
  if (production && apply && !allowProduction) {
    throw new Error('Produccion detectada. Usa --allow-production para aplicar.');
  }

  const admin = await findAdmin();
  if (!admin) {
    console.log(`admin encontrado: no (${ADMIN_EMAIL})`);
    return;
  }
  console.log(`admin encontrado: si (${admin.email})`);

  const { tournament, all, ambiguous } = await findTournament(admin.id);
  if (ambiguous) {
    console.log(`torneo ambiguo para "${TARGET_TOURNAMENT_NAME}". Torneos del admin:`);
    for (const t of all) console.log(`- ${t.title} (${t.id})`);
    return;
  }
  if (!tournament) {
    console.log(`torneo encontrado: no (${TARGET_TOURNAMENT_NAME})`);
    for (const t of all) console.log(`- ${t.title} (${t.id})`);
    return;
  }

  const activeRegistrations = tournament.registrations.filter((r) => r.status !== TournamentRegistrationStatus.CANCELED);
  const activeUserIds = new Set<string>();
  for (const r of activeRegistrations) {
    activeUserIds.add(r.userId);
    if (r.partnerUserId) activeUserIds.add(r.partnerUserId);
  }

  if (activeUserIds.size > TARGET_TOTAL) {
    console.log(`torneo encontrado: si (${tournament.id})`);
    console.log(`inscritos actuales: ${activeUserIds.size}`);
    console.log('estado: abortado, supera el cupo objetivo de 16');
    return;
  }

  const existingDemoUsers = await prisma.user.findMany({
    where: { email: { in: demoEmails } },
    select: { id: true, email: true },
  });
  const existingDemoUserIds = new Set(existingDemoUsers.map((u) => u.id));

  const crossTournament = await prisma.tournamentRegistration.findMany({
    where: {
      tournamentId: { not: tournament.id },
      status: { not: TournamentRegistrationStatus.CANCELED },
      OR: [
        { userId: { in: [...existingDemoUserIds] } },
        { partnerUserId: { in: [...existingDemoUserIds] } },
      ],
    },
    select: { tournamentId: true, userId: true, partnerUserId: true },
  });

  if (crossTournament.length > 0) {
    console.log('estado: abortado, hay usuarios demo ya inscritos en otro torneo');
    return;
  }

  const missing = TARGET_TOTAL - activeUserIds.size;
  console.log(`torneo encontrado: si (${tournament.id})`);
  console.log(`inscritos actuales: ${activeUserIds.size}`);
  console.log(`cupos faltantes: ${missing}`);
  console.log(`emails demo a usar: ${demoEmails.join(', ')}`);
  console.log(`registros a insertar: ${Math.max(0, missing)}`);

  if (dryRun && !apply) {
    return;
  }

  if (!apply) {
    console.log('modo dry-run: no se ejecutaron cambios');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const currentTournament = await tx.tournament.findUnique({
      where: { id: tournament.id },
      select: { id: true, playerCapacity: true, createdById: true },
    });
    if (!currentTournament) throw new Error('Torneo no encontrado al aplicar');
    if (currentTournament.createdById !== admin.id) throw new Error('Admin incorrecto al aplicar');

    const currentRegistrations = await tx.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id, status: { not: TournamentRegistrationStatus.CANCELED } },
      select: { userId: true, partnerUserId: true },
    });
    const currentIds = new Set<string>();
    for (const r of currentRegistrations) {
      currentIds.add(r.userId);
      if (r.partnerUserId) currentIds.add(r.partnerUserId);
    }
    if (currentIds.size > TARGET_TOTAL) {
      throw new Error(`El torneo ya tiene ${currentIds.size} inscritos activos, supera 16`);
    }

    let needed = TARGET_TOTAL - currentIds.size;
    for (let i = 0; i < demoEmails.length && needed > 0; i++) {
      const email = demoEmails[i];
      const user = await ensureDemoUser(tx, i);
      if (currentIds.has(user.id)) continue;

      const alreadyRegistered = await tx.tournamentRegistration.findFirst({
        where: {
          tournamentId: tournament.id,
          OR: [{ userId: user.id }, { partnerUserId: user.id }],
          status: { not: TournamentRegistrationStatus.CANCELED },
        },
        select: { id: true },
      });
      if (alreadyRegistered) continue;

      await tx.tournamentRegistration.create({
        data: {
          tournamentId: tournament.id,
          userId: user.id,
          mode: TournamentRegistrationMode.SOLO,
          status: TournamentRegistrationStatus.PENDING,
        },
      });
      needed -= 1;
    }

    const finalRegs = await tx.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id, status: { not: TournamentRegistrationStatus.CANCELED } },
      select: { userId: true, partnerUserId: true },
    });
    const finalIds = new Set<string>();
    for (const r of finalRegs) {
      finalIds.add(r.userId);
      if (r.partnerUserId) finalIds.add(r.partnerUserId);
    }
    if (finalIds.size !== TARGET_TOTAL) {
      throw new Error(`Conteo final invalido: ${finalIds.size}`);
    }
  });

  console.log('apply: completado');
}

main()
  .catch((error) => {
    console.error('seed:fill-roma-prueba failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
