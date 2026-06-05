import 'dotenv/config';
import bcrypt from 'bcrypt';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ExperienceLevel,
  PrismaClient,
  Prisma,
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
const DEMO_CATEGORY = '4TA';

type DemoParticipant = {
  name: string;
  email: string;
  preferredSide: string;
  preferredClub: string;
  rankingPosition: number;
  experiencePoints: number;
  wins: number;
  weeklyStreak: number;
};

type TournamentSeed = {
  title: string;
  adminEmail: string;
  location: string;
  district: string;
  prize: string;
  participants: DemoParticipant[];
};

type DryRunSummaryItem = {
  title: string;
  adminEmail: string;
  adminFound: boolean;
  tournamentExists: boolean;
  participantCount: number;
  participantEmails: string[];
};

type ApplyResultItem = {
  title: string;
  adminEmail: string;
  admin: {
    id: string;
    name: string;
    email: string;
  };
  tournamentId: string;
  participantCount: number;
};

const seeds: TournamentSeed[] = [
  {
    title: 'Americano Demo - Tomás',
    adminEmail: 'tomascastmros@gmail.com',
    location: 'One Padel Olguín',
    district: 'Santiago de Surco',
    prize: 'Demo PGO',
    participants: buildParticipants('tomas', 'Demo Tomás', 'One Padel Olguín'),
  },
  {
    title: 'Americano Demo - Arom',
    adminEmail: 'aromhr2106@gmail.com',
    location: 'One Padel Trigal',
    district: 'Santiago de Surco',
    prize: 'Demo PGO',
    participants: buildParticipants('arom', 'Demo Arom', 'One Padel Trigal'),
  },
];

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

function buildParticipants(
  prefix: 'tomas' | 'arom',
  displayPrefix: string,
  club: string,
): DemoParticipant[] {
  return Array.from({ length: 12 }, (_, index) => {
    const n = index + 1;
    return {
      name: `${displayPrefix} ${String(n).padStart(2, '0')}`,
      email: `demo.${prefix}.${String(n).padStart(2, '0')}@pgo.local`,
      preferredSide: n % 2 === 0 ? 'Revés' : 'Drive',
      preferredClub: club,
      rankingPosition: 20 + n,
      experiencePoints: 40 + n * 5,
      wins: n % 4,
      weeklyStreak: n % 3,
    };
  });
}

async function ensureDemoUser(tx: Prisma.TransactionClient, participant: DemoParticipant) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await tx.user.upsert({
    where: { email: participant.email },
    create: {
      name: participant.name,
      email: participant.email,
      passwordHash,
      isActive: true,
      allowMatchInvites: true,
    },
    update: {
      name: participant.name,
      passwordHash,
      isActive: true,
      allowMatchInvites: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  await tx.profile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      category: DEMO_CATEGORY,
      categoryOrigin: 'manual',
      categoryIsProvisional: false,
      hasCompletedInitialOnboarding: true,
      preferredClub: participant.preferredClub,
      preferredSide: participant.preferredSide,
      experienceLevel: ExperienceLevel.INTERMEDIATE,
      rankingPosition: participant.rankingPosition,
      experiencePoints: participant.experiencePoints,
      wins: participant.wins,
      weeklyStreak: participant.weeklyStreak,
    },
    update: {
      category: DEMO_CATEGORY,
      categoryOrigin: 'manual',
      categoryIsProvisional: false,
      hasCompletedInitialOnboarding: true,
      preferredClub: participant.preferredClub,
      preferredSide: participant.preferredSide,
      experienceLevel: ExperienceLevel.INTERMEDIATE,
      rankingPosition: participant.rankingPosition,
      experiencePoints: participant.experiencePoints,
      wins: participant.wins,
      weeklyStreak: participant.weeklyStreak,
    },
  });

  return user;
}

async function ensureAdminExists(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });
}

async function findOrCreateTournament(
  tx: Prisma.TransactionClient,
  seed: TournamentSeed,
  adminId: string,
) {
  const existing = await tx.tournament.findFirst({
    where: {
      createdById: adminId,
      title: seed.title,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    await tx.tournament.update({
      where: { id: existing.id },
      data: {
        tournamentType: 'Americano',
        pairingMode: 'FIXED',
        playerCapacity: 16,
        modality: 'Masculino',
        format: 'Dobles',
        location: seed.location,
        district: seed.district,
        prize: seed.prize,
        status: TournamentStatus.PUBLISHED,
        registrationsOpen: true,
      },
    });
    return { id: existing.id, created: false };
  }

  const created = await tx.tournament.create({
    data: {
      createdById: adminId,
      title: seed.title,
      tournamentType: 'Americano',
      pairingMode: 'FIXED',
      playerCapacity: 16,
      modality: 'Masculino',
      format: 'Dobles',
      location: seed.location,
      district: seed.district,
      city: 'Lima',
      startsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      prize: seed.prize,
      entryFee: 0,
      category: DEMO_CATEGORY,
      status: TournamentStatus.PUBLISHED,
      registrationsOpen: true,
      description: `Torneo demo para pruebas de PGO: ${seed.title}.`,
    },
    select: { id: true },
  });

  return { id: created.id, created: true };
}

async function seedTournament(tx: Prisma.TransactionClient, seed: TournamentSeed) {
  const admin = await ensureAdminExists(seed.adminEmail);
  if (!admin) {
    throw new Error(`Admin no encontrado: ${seed.adminEmail}`);
  }

  const tournament = await findOrCreateTournament(tx, seed, admin.id);

  const participantUsers: Array<{
    id: string;
    email: string;
    name: string;
  }> = [];
  for (const participant of seed.participants) {
    participantUsers.push(await ensureDemoUser(tx, participant));
  }

  for (const [index, user] of participantUsers.entries()) {
    const participant = seed.participants[index];
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
        preferredSide: participant.preferredSide,
        availability: 'Demo seed',
      },
      update: {
        mode: TournamentRegistrationMode.SOLO,
        status: TournamentRegistrationStatus.CONFIRMED,
        preferredSide: participant.preferredSide,
        availability: 'Demo seed',
        partnerUserId: null,
      },
    });
  }

  return {
    admin,
    tournamentId: tournament.id,
    participantCount: participantUsers.length,
  };
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

  const drySummary: DryRunSummaryItem[] = [];
  for (const seed of seeds) {
    const admin = await ensureAdminExists(seed.adminEmail);
    const existing = admin
      ? await prisma.tournament.findFirst({
          where: { createdById: admin.id, title: seed.title },
          select: { id: true },
        })
      : null;
    drySummary.push({
      title: seed.title,
      adminEmail: seed.adminEmail,
      adminFound: Boolean(admin),
      tournamentExists: Boolean(existing),
      participantCount: seed.participants.length,
      participantEmails: seed.participants.map((item) => item.email),
    });
  }

  console.log('\nResumen dry-run:');
  for (const item of drySummary) {
    console.log(`- admin ${item.adminEmail}: ${item.adminFound ? 'si' : 'no'}`);
    console.log(`  torneo: ${item.title}`);
    console.log(`  existe: ${item.tournamentExists ? 'si' : 'no'}`);
    console.log(`  participantes demo: ${item.participantCount}`);
    console.log(`  emails: ${item.participantEmails.join(', ')}`);
    console.log(`  registros a insertar: ${item.participantCount}`);
  }

  if (dryRun && !apply) {
    console.log('\nDry-run completado. No se hicieron cambios.');
    await prisma.$disconnect();
    return;
  }

  const result: ApplyResultItem[] = await prisma.$transaction(async (tx) => {
    const output: ApplyResultItem[] = [];
    for (const seed of seeds) {
      const seeded = await seedTournament(tx, seed);
      output.push({
        title: seed.title,
        adminEmail: seed.adminEmail,
        ...seeded,
      });
    }
    return output;
  });

  console.log('\nPost-apply:');
  for (const item of result) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: item.tournamentId },
      include: {
        registrations: {
          where: { status: TournamentRegistrationStatus.CONFIRMED },
          select: { id: true },
        },
      },
    });
    console.log(`- ${item.title}`);
    console.log(`  admin=${item.admin.email}`);
    console.log(`  tournamentId=${item.tournamentId}`);
    console.log(`  registrations=${tournament?.registrations.length ?? 0}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
