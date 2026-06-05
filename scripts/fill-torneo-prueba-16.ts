import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient, TournamentRegistrationMode, TournamentRegistrationStatus, ExperienceLevel, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no esta definida en el entorno actual.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ADMIN_EMAIL = 'tomascastmros@gmail.com';
const TARGET_TITLE = 'torneo prueba';
const TARGET_TOTAL = 16;
const DEMO_PASSWORD = 'Demo12345*';
const DEMO_CATEGORY = '4TA';
const DEMO_CLUB = 'One Padel Olguin';
const DEMO_SIDE = 'Ambos';
const DEMO_EXPERIENCE = ExperienceLevel.INTERMEDIATE;
const demoEmails = Array.from({ length: TARGET_TOTAL }, (_, i) => `demo.torneo.prueba.${String(i + 1).padStart(2, '0')}@pgo.local`);

function norm(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function isProductionEnv() {
  const env = `${process.env.NODE_ENV ?? ''} ${process.env.DATABASE_URL ?? ''}`.toLowerCase();
  return env.includes('prod') || env.includes('production');
}

async function ensureDemoUser(tx: Prisma.TransactionClient, index: number) {
  const email = demoEmails[index];
  const name = `Demo Torneo ${String(index + 1).padStart(2, '0')}`;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return tx.user.upsert({
    where: { email },
    create: {
      name,
      email,
      passwordHash,
      profile: {
        create: {
          category: DEMO_CATEGORY,
          preferredClub: DEMO_CLUB,
          preferredSide: DEMO_SIDE,
          experienceLevel: DEMO_EXPERIENCE,
        },
      },
    },
    update: {
      name,
      profile: {
        upsert: {
          create: {
            category: DEMO_CATEGORY,
            preferredClub: DEMO_CLUB,
            preferredSide: DEMO_SIDE,
            experienceLevel: DEMO_EXPERIENCE,
          },
          update: {
            category: DEMO_CATEGORY,
            preferredClub: DEMO_CLUB,
            preferredSide: DEMO_SIDE,
            experienceLevel: DEMO_EXPERIENCE,
          },
        },
      },
    },
    select: { id: true, email: true },
  });
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const apply = hasFlag('--apply');
  const allowProduction = hasFlag('--allow-production');
  const production = isProductionEnv();

  if (production && apply && !allowProduction) {
    throw new Error('Produccion detectada. Usa --allow-production para aplicar.');
  }

  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, name: true },
  });
  if (!admin) {
    console.log(`admin encontrado: no (${ADMIN_EMAIL})`);
    return;
  }
  console.log(`admin encontrado: si (${admin.email})`);

  const tournaments = await prisma.tournament.findMany({
    where: { createdById: admin.id },
    select: {
      id: true,
      title: true,
      createdById: true,
      createdBy: { select: { email: true, name: true } },
      registrations: {
        select: { id: true, userId: true, partnerUserId: true, status: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const exact = tournaments.filter((t) => norm(t.title) === norm(TARGET_TITLE));
  const similar = tournaments.filter((t) => {
    const title = norm(t.title);
    const target = norm(TARGET_TITLE);
    return title.includes(target) || target.includes(title);
  });

  let tournament = exact.length === 1 ? exact[0] : null;
  if (!tournament && exact.length === 0 && similar.length === 1) tournament = similar[0];

  if (exact.length > 1 || (!tournament && similar.length > 1)) {
    console.log(`torneo ambiguo para "${TARGET_TITLE}". Torneos del admin:`);
    for (const t of tournaments) console.log(`- ${t.title} (${t.id}) admin=${t.createdBy.email}`);
    return;
  }

  if (!tournament) {
    console.log(`torneo encontrado: no (${TARGET_TITLE})`);
    for (const t of tournaments) console.log(`- ${t.title} (${t.id}) admin=${t.createdBy.email}`);
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

  const missing = TARGET_TOTAL - activeUserIds.size;
  console.log(`torneo encontrado: si (${tournament.id})`);
  console.log(`admin/creator: ${tournament.createdBy.email}`);
  console.log(`inscritos actuales: ${activeUserIds.size}`);
  console.log(`cupos faltantes: ${missing}`);
  console.log(`emails demo a usar: ${demoEmails.slice(0, missing).join(', ')}`);

  if (dryRun && !apply) return;
  if (!apply) return;

  await prisma.$transaction(async (tx) => {
    const current = await tx.tournament.findUnique({
      where: { id: tournament.id },
      select: {
        id: true,
        createdById: true,
        registrations: {
          select: { userId: true, partnerUserId: true, status: true },
        },
      },
    });
    if (!current) throw new Error('Torneo no encontrado al aplicar');
    if (current.createdById !== admin.id) throw new Error('Admin incorrecto al aplicar');

    const currentIds = new Set<string>();
    for (const r of current.registrations.filter((r) => r.status !== TournamentRegistrationStatus.CANCELED)) {
      currentIds.add(r.userId);
      if (r.partnerUserId) currentIds.add(r.partnerUserId);
    }
    if (currentIds.size > TARGET_TOTAL) throw new Error(`El torneo ya tiene ${currentIds.size} inscritos activos`);

    let needed = TARGET_TOTAL - currentIds.size;
    for (let i = 0; i < demoEmails.length && needed > 0; i++) {
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

    const finalRegistrations = await tx.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id, status: { not: TournamentRegistrationStatus.CANCELED } },
      select: { userId: true, partnerUserId: true },
    });
    const finalIds = new Set<string>();
    for (const r of finalRegistrations) {
      finalIds.add(r.userId);
      if (r.partnerUserId) finalIds.add(r.partnerUserId);
    }
    if (finalIds.size !== TARGET_TOTAL) throw new Error(`Conteo final invalido: ${finalIds.size}`);
  });

  console.log('apply: completado');
}

main()
  .catch((error) => {
    console.error('seed:fill-torneo-prueba-16 failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
