import 'dotenv/config';

import bcrypt from 'bcrypt';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ExperienceLevel,
  MatchStatus,
  MatchType,
  Prisma,
  PrismaClient,
  TournamentRegistrationMode,
  TournamentRegistrationStatus,
  TournamentStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no esta definida en el entorno actual.');
}

loadEnvFile(resolve(process.cwd(), '.env'));

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DEMO_PASSWORD = 'Demo12345*';
const DEMO_CATEGORY = '4ta categoria';
const MATCH_TITLE = 'Partido Demo Admin - Arom';
const TOURNAMENT_TITLE = 'Americano Demo Tomas 12';
const TOURNAMENT_CAPACITY = 12;
const TOURNAMENT_INSCRIBED = 11;

type DemoUserSpec = {
  name: string;
  email: string;
  preferredClub: string;
  preferredSide: string;
  rankingPosition: number;
  experiencePoints: number;
  wins: number;
  weeklyStreak: number;
};

type SeedTarget = {
  adminEmail: string;
  title: string;
};

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
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has('--dry-run') || !args.has('--apply'),
    apply: args.has('--apply'),
    allowProduction: args.has('--allow-production'),
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
      host.startsWith('10.') ||
      host.startsWith('172.') ||
      host.startsWith('192.168.') ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

function buildUsers(prefix: 'arom-match' | 'tomas-tournament'): DemoUserSpec[] {
  const club = prefix === 'arom-match' ? 'One Padel Trigal' : 'One Padel Olguin';
  const label = prefix === 'arom-match' ? 'Demo Match Arom' : 'Demo Tomas Torneo';
  const base = prefix === 'arom-match' ? 'demo.arom.match' : 'demo.tomas.torneo12';

  return Array.from({ length: prefix === 'arom-match' ? 12 : 11 }, (_, index) => {
    const n = index + 1;
    return {
      name: `${label} ${String(n).padStart(2, '0')}`,
      email: `${base}.${String(n).padStart(2, '0')}@pgo.local`,
      preferredClub: club,
      preferredSide: n % 2 === 0 ? 'Revés' : 'Drive',
      rankingPosition: 20 + n,
      experiencePoints: 40 + n * 5,
      wins: n % 4,
      weeklyStreak: n % 3,
    };
  });
}

const matchUsers = buildUsers('arom-match');
const tournamentUsers = buildUsers('tomas-tournament');

async function upsertDemoUser(tx: Prisma.TransactionClient, spec: DemoUserSpec) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await tx.user.upsert({
    where: { email: spec.email },
    create: {
      name: spec.name,
      email: spec.email,
      passwordHash,
      isActive: true,
      allowMatchInvites: true,
      profile: {
        create: {
          category: DEMO_CATEGORY,
          categoryOrigin: 'manual',
          categoryIsProvisional: false,
          hasCompletedInitialOnboarding: true,
          preferredClub: spec.preferredClub,
          preferredSide: spec.preferredSide,
          experienceLevel: ExperienceLevel.INTERMEDIATE,
          rankingPosition: spec.rankingPosition,
          experiencePoints: spec.experiencePoints,
          wins: spec.wins,
          weeklyStreak: spec.weeklyStreak,
        },
      },
    },
    update: {
      name: spec.name,
      passwordHash,
      isActive: true,
      allowMatchInvites: true,
      profile: {
        upsert: {
          create: {
            category: DEMO_CATEGORY,
            categoryOrigin: 'manual',
            categoryIsProvisional: false,
            hasCompletedInitialOnboarding: true,
            preferredClub: spec.preferredClub,
            preferredSide: spec.preferredSide,
            experienceLevel: ExperienceLevel.INTERMEDIATE,
            rankingPosition: spec.rankingPosition,
            experiencePoints: spec.experiencePoints,
            wins: spec.wins,
            weeklyStreak: spec.weeklyStreak,
          },
          update: {
            category: DEMO_CATEGORY,
            categoryOrigin: 'manual',
            categoryIsProvisional: false,
            hasCompletedInitialOnboarding: true,
            preferredClub: spec.preferredClub,
            preferredSide: spec.preferredSide,
            experienceLevel: ExperienceLevel.INTERMEDIATE,
            rankingPosition: spec.rankingPosition,
            experiencePoints: spec.experiencePoints,
            wins: spec.wins,
            weeklyStreak: spec.weeklyStreak,
          },
        },
      },
    },
    select: { id: true, email: true, name: true },
  });

  return user;
}

async function findAdmin(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });
}

async function findOrCreateMatch(tx: Prisma.TransactionClient, adminId: string) {
  const existing = await tx.match.findFirst({
    where: {
      createdById: adminId,
      clubName: MATCH_TITLE,
    },
    select: {
      id: true,
      status: true,
      participants: {
        select: { userId: true, slot: true },
      },
    },
  });

  if (existing) {
    if (existing.status === MatchStatus.COMPLETED) {
      throw new Error(`Ya existe un match completado con nombre "${MATCH_TITLE}".`);
    }
    return { id: existing.id, created: false, participantCount: existing.participants.length };
  }

  const created = await tx.match.create({
    data: {
      createdById: adminId,
      clubName: MATCH_TITLE,
      playedAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      matchType: MatchType.FRIENDLY,
      status: MatchStatus.DRAFT,
      description: 'Seed demo PGO',
      participants: {
        create: [],
      },
    },
    select: { id: true },
  });

  return { id: created.id, created: true, participantCount: 0 };
}

async function findOrCreateTournament(tx: Prisma.TransactionClient, adminId: string) {
  const existing = await tx.tournament.findFirst({
    where: {
      createdById: adminId,
      title: TOURNAMENT_TITLE,
    },
    select: {
      id: true,
      playerCapacity: true,
      registrations: {
        select: { id: true, userId: true, partnerUserId: true, status: true },
      },
    },
  });

  if (existing) {
    await tx.tournament.update({
      where: { id: existing.id },
      data: {
        tournamentType: 'Americano',
        pairingMode: 'FIXED',
        playerCapacity: TOURNAMENT_CAPACITY,
        modality: 'Masculino',
        format: 'Dobles',
        status: TournamentStatus.PUBLISHED,
        registrationsOpen: true,
      },
    });

    return {
      id: existing.id,
      created: false,
      activeRegistrations: existing.registrations.filter(
        (registration) => registration.status !== TournamentRegistrationStatus.CANCELED,
      ).length,
    };
  }

  const created = await tx.tournament.create({
    data: {
      createdById: adminId,
      title: TOURNAMENT_TITLE,
      tournamentType: 'Americano',
      pairingMode: 'FIXED',
      playerCapacity: TOURNAMENT_CAPACITY,
      modality: 'Masculino',
      format: 'Dobles',
      location: 'One Padel',
      city: 'Lima',
      district: 'Santiago de Surco',
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      prize: 'Demo PGO',
      entryFee: 0,
      category: DEMO_CATEGORY,
      status: TournamentStatus.PUBLISHED,
      registrationsOpen: true,
      description: 'Seed demo PGO',
    },
    select: { id: true },
  });

  return { id: created.id, created: true, activeRegistrations: 0 };
}

async function seedMatch(tx: Prisma.TransactionClient, admin: { id: string; email: string }, dryRun: boolean) {
  const match = await findOrCreateMatch(tx, admin.id);
  const createdUsers = [];
  for (const userSpec of matchUsers) {
    createdUsers.push(await upsertDemoUser(tx, userSpec));
  }

  const participantIds = [admin.id, ...createdUsers.map((user) => user.id)];
  const allowedIds = new Set(participantIds);
  const participantCount = participantIds.length;
  const existingParticipants = await tx.matchParticipant.findMany({
    where: { matchId: match.id },
    select: { userId: true, slot: true },
  });
  const existingIds = new Set(existingParticipants.map((item) => item.userId));

  for (const existingId of existingIds) {
    if (!allowedIds.has(existingId)) {
      throw new Error(
        `El match ${MATCH_TITLE} ya contiene participantes que no pertenecen al seed.`,
      );
    }
  }

  if (existingIds.size > participantCount) {
    throw new Error(
      `El match ${MATCH_TITLE} ya tiene mas de ${participantCount} participantes.`,
    );
  }

  if (!existingIds.has(admin.id) && existingIds.size >= participantCount) {
    throw new Error(
      `El match ${MATCH_TITLE} ya ocupa todos los cupos sin incluir al admin.`,
    );
  }

  if (!dryRun) {
    let slot = existingParticipants.reduce(
      (max, participant) => Math.max(max, participant.slot),
      0,
    );
    for (const userId of participantIds) {
      if (existingIds.has(userId)) continue;
      slot += 1;
      await tx.matchParticipant.upsert({
        where: {
          matchId_userId: {
            matchId: match.id,
            userId,
          },
        },
        create: {
          matchId: match.id,
          userId,
          slot,
          team: slot <= Math.ceil(participantCount / 2) ? 1 : 2,
        },
        update: {
          slot,
          team: slot <= Math.ceil(participantCount / 2) ? 1 : 2,
        },
      });
    }
  }

  return {
    matchId: match.id,
    participantCount,
    activeCount: existingIds.size,
    demoEmails: createdUsers.map((user) => user.email),
  };
}

async function seedTournament(tx: Prisma.TransactionClient, admin: { id: string; email: string }, dryRun: boolean) {
  const tournament = await findOrCreateTournament(tx, admin.id);
  const users = [];
  for (const userSpec of tournamentUsers) {
    users.push(await upsertDemoUser(tx, userSpec));
  }
  const allowedIds = new Set(users.map((user) => user.id));

  const existingRegs = await tx.tournamentRegistration.findMany({
    where: { tournamentId: tournament.id, status: { not: TournamentRegistrationStatus.CANCELED } },
    select: { userId: true, partnerUserId: true },
  });
  const activeIds = new Set<string>();
  for (const reg of existingRegs) {
    activeIds.add(reg.userId);
    if (reg.partnerUserId) activeIds.add(reg.partnerUserId);
  }

  for (const existingId of activeIds) {
    if (!allowedIds.has(existingId)) {
      throw new Error(
        `El torneo ${TOURNAMENT_TITLE} ya contiene inscritos que no pertenecen al seed.`,
      );
    }
  }

  if (activeIds.size > TOURNAMENT_INSCRIBED) {
    throw new Error(
      `El torneo ${TOURNAMENT_TITLE} ya tiene mas de ${TOURNAMENT_INSCRIBED} inscritos activos.`,
    );
  }

  if (!dryRun) {
    for (const user of users) {
      if (activeIds.has(user.id)) continue;
      await tx.tournamentRegistration.upsert({
        where: {
          tournamentId_userId: {
            tournamentId: tournament.id,
            userId: user.id,
          },
        },
        create: {
          tournamentId: tournament.id,
          userId: user.id,
          mode: TournamentRegistrationMode.SOLO,
          status: TournamentRegistrationStatus.CONFIRMED,
          preferredSide: 'Drive',
          availability: 'Seed demo',
        },
        update: {
          mode: TournamentRegistrationMode.SOLO,
          status: TournamentRegistrationStatus.CONFIRMED,
          preferredSide: 'Drive',
          availability: 'Seed demo',
          partnerUserId: null,
        },
      });
    }
  }

  return {
    tournamentId: tournament.id,
    registeredCount: activeIds.size,
    demoEmails: users.map((user) => user.email),
  };
}

async function main() {
  const { dryRun, apply, allowProduction } = parseArgs();
  const databaseUrl = process.env.DATABASE_URL ?? null;
  const local = isLikelyLocalDatabase(databaseUrl);

  if (!databaseUrl) {
    throw new Error('DATABASE_URL no definida');
  }

  if (!local && apply && !allowProduction) {
    console.log('Entorno detectado: PRODUCCION/EXTERNO');
    console.log('Abortado. Usa --allow-production para aplicar.');
    process.exit(1);
  }

  console.log(`Entorno detectado: ${local ? 'LOCAL/DEV' : 'PRODUCCION/EXTERNO'}`);
  console.log(`Modo: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  await prisma.$connect();

  const matchAdmin = await findAdmin('aromhr2106@gmail.com');
  const tournamentAdmin = await findAdmin('tomascastmros@gmail.com');

  console.log(`Admin Arom encontrado: ${matchAdmin ? 'si' : 'no'}`);
  console.log(`Admin Tomas encontrado: ${tournamentAdmin ? 'si' : 'no'}`);

  if (!matchAdmin || !tournamentAdmin) {
    await prisma.$disconnect();
    return;
  }

  const matchPreview = await prisma.match.findFirst({
    where: { createdById: matchAdmin.id, clubName: MATCH_TITLE },
    select: { id: true, participants: { select: { userId: true } } },
  });
  const tournamentPreview = await prisma.tournament.findFirst({
    where: { createdById: tournamentAdmin.id, title: TOURNAMENT_TITLE },
    select: {
      id: true,
      playerCapacity: true,
      registrations: {
        select: { id: true, userId: true, partnerUserId: true, status: true },
      },
    },
  });

  console.log(`Modelo partido: Match`);
  console.log(`Partido que se crearia: ${MATCH_TITLE}`);
  console.log(`Jugadores demo partido: ${matchUsers.map((user) => user.email).join(', ')}`);
  console.log(`Participantes objetivo partido: ${matchUsers.length + 1}`);
  console.log(`Capacidad torneo: ${TOURNAMENT_CAPACITY}`);
  console.log(`Torneo que se crearia: ${TOURNAMENT_TITLE}`);
  console.log(`Inscritos demo torneo: ${tournamentUsers.length}`);

  if (matchPreview) {
    console.log(`Match existente: si (${matchPreview.id})`);
    console.log(`Participantes actuales: ${matchPreview.participants.length}`);
    console.log(
      `Registros a insertar partido: ${Math.max(0, matchUsers.length + 1 - matchPreview.participants.length)}`,
    );
  } else {
    console.log('Match existente: no');
    console.log(`Registros a insertar partido: ${matchUsers.length + 1}`);
  }

  if (tournamentPreview) {
    const active = tournamentPreview.registrations.filter(
      (registration) => registration.status !== TournamentRegistrationStatus.CANCELED,
    ).length;
    console.log(`Torneo existente: si (${tournamentPreview.id})`);
    console.log(`Inscritos actuales: ${active}`);
    console.log(
      `Registros a insertar torneo: ${Math.max(0, TOURNAMENT_INSCRIBED - active)}`,
    );
  } else {
    console.log('Torneo existente: no');
    console.log(`Registros a insertar torneo: ${TOURNAMENT_INSCRIBED}`);
  }

  if (dryRun && !apply) {
    console.log('Dry-run completado. No se hicieron cambios.');
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const matchResult = await seedMatch(tx, matchAdmin, false);
    const tournamentResult = await seedTournament(tx, tournamentAdmin, false);
    return { matchResult, tournamentResult };
  });

  const matchFinal = await prisma.match.findUnique({
    where: { id: result.matchResult.matchId },
    include: {
      participants: {
        orderBy: { slot: 'asc' },
        select: { userId: true },
      },
    },
  });
  const tournamentFinal = await prisma.tournament.findUnique({
    where: { id: result.tournamentResult.tournamentId },
    include: {
      registrations: {
        where: { status: { not: TournamentRegistrationStatus.CANCELED } },
        select: { userId: true, partnerUserId: true },
      },
    },
  });

  console.log('Post-apply:');
  console.log(`- partido ${MATCH_TITLE}: ${matchFinal?.participants.length ?? 0} participantes`);
  console.log(`- torneo ${TOURNAMENT_TITLE}: ${tournamentFinal?.registrations.length ?? 0} inscritos`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('seed:admin-match-and-tournament failed');
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
