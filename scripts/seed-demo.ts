import 'dotenv/config';
import bcrypt from 'bcrypt';
import {
  ExperienceLevel,
  MatchStatus,
  MatchType,
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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DEMO_EMAIL_PREFIX = 'demo_';
const DEMO_TOURNAMENT_PREFIX = '[DEMO] ';
const DEMO_PASSWORD = 'Demo12345*';

type DemoUserSeed = {
  name: string;
  email: string;
  category: string;
  preferredClub: string;
  experienceLevel: ExperienceLevel;
  rankingPosition: number;
  experiencePoints: number;
  wins: number;
  weeklyStreak: number;
  photoUrl?: string;
};

const demoUsers: DemoUserSeed[] = [
  {
    name: 'Demo Romario',
    email: `${DEMO_EMAIL_PREFIX}romario@pgo.test`,
    category: '4TA',
    preferredClub: 'One Padel Olguin',
    experienceLevel: ExperienceLevel.INTERMEDIATE,
    rankingPosition: 12,
    experiencePoints: 140,
    wins: 4,
    weeklyStreak: 2,
  },
  {
    name: 'Demo Aaron',
    email: `${DEMO_EMAIL_PREFIX}aaron@pgo.test`,
    category: '4TA',
    preferredClub: 'One Padel Olguin',
    experienceLevel: ExperienceLevel.INTERMEDIATE,
    rankingPosition: 18,
    experiencePoints: 90,
    wins: 3,
    weeklyStreak: 1,
  },
  {
    name: 'Demo Edu',
    email: `${DEMO_EMAIL_PREFIX}edu@pgo.test`,
    category: '4TA',
    preferredClub: 'One Padel Olguin',
    experienceLevel: ExperienceLevel.INTERMEDIATE,
    rankingPosition: 22,
    experiencePoints: 70,
    wins: 2,
    weeklyStreak: 1,
  },
  {
    name: 'Demo Karo',
    email: `${DEMO_EMAIL_PREFIX}karo@pgo.test`,
    category: '3RA',
    preferredClub: 'One Padel Trigal',
    experienceLevel: ExperienceLevel.ADVANCED,
    rankingPosition: 8,
    experiencePoints: 220,
    wins: 8,
    weeklyStreak: 3,
  },
  {
    name: 'Demo Yupi',
    email: `${DEMO_EMAIL_PREFIX}yupi@pgo.test`,
    category: '3RA',
    preferredClub: 'One Padel Trigal',
    experienceLevel: ExperienceLevel.ADVANCED,
    rankingPosition: 10,
    experiencePoints: 210,
    wins: 7,
    weeklyStreak: 2,
  },
  {
    name: 'Demo Logan',
    email: `${DEMO_EMAIL_PREFIX}logan@pgo.test`,
    category: '2DA',
    preferredClub: 'Mad Padel Molina',
    experienceLevel: ExperienceLevel.PRO,
    rankingPosition: 4,
    experiencePoints: 320,
    wins: 12,
    weeklyStreak: 4,
  },
];

async function cleanupDemoData() {
  const existingUsers = await prisma.user.findMany({
    where: {
      email: {
        startsWith: DEMO_EMAIL_PREFIX,
      },
    },
    select: {
      id: true,
    },
  });

  const userIds = existingUsers.map((user) => user.id);

  if (userIds.length > 0) {
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { createdById: { in: userIds } },
          {
            participants: {
              some: {
                userId: {
                  in: userIds,
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    const matchIds = matches.map((match) => match.id);

    if (matchIds.length > 0) {
      await prisma.matchParticipant.deleteMany({
        where: {
          matchId: {
            in: matchIds,
          },
        },
      });

      await prisma.match.deleteMany({
        where: {
          id: {
            in: matchIds,
          },
        },
      });
    }

    await prisma.tournament.deleteMany({
      where: {
        OR: [
          { title: { startsWith: DEMO_TOURNAMENT_PREFIX } },
          { createdById: { in: userIds } },
        ],
      },
    });

    await prisma.profile.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });
  }
}

async function main() {
  await cleanupDemoData();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const createdUsers = new Map<string, string>();

  for (const seed of demoUsers) {
    const user = await prisma.user.create({
      data: {
        name: seed.name,
        email: seed.email,
        passwordHash,
        profile: {
          create: {
            photoUrl: seed.photoUrl,
            experiencePoints: seed.experiencePoints,
            category: seed.category,
            preferredClub: seed.preferredClub,
            experienceLevel: seed.experienceLevel,
            rankingPosition: seed.rankingPosition,
            wins: seed.wins,
            weeklyStreak: seed.weeklyStreak,
            friendsCount: 5,
            followersCount: 9,
            followingCount: 6,
            socialNotificationsCount: 2,
          },
        },
      },
    });

    createdUsers.set(seed.email, user.id);
  }

  const romarioId = createdUsers.get(`${DEMO_EMAIL_PREFIX}romario@pgo.test`)!;
  const aaronId = createdUsers.get(`${DEMO_EMAIL_PREFIX}aaron@pgo.test`)!;
  const eduId = createdUsers.get(`${DEMO_EMAIL_PREFIX}edu@pgo.test`)!;
  const karoId = createdUsers.get(`${DEMO_EMAIL_PREFIX}karo@pgo.test`)!;
  const yupiId = createdUsers.get(`${DEMO_EMAIL_PREFIX}yupi@pgo.test`)!;
  const loganId = createdUsers.get(`${DEMO_EMAIL_PREFIX}logan@pgo.test`)!;

  await prisma.match.create({
    data: {
      createdById: romarioId,
      clubName: 'One Padel Olguin',
      playedAt: new Date('2026-03-20T21:30:00.000Z'),
      matchType: MatchType.RANKED,
      status: MatchStatus.COMPLETED,
      winnerTeam: 1,
      games: [
        { team1: 6, team2: 3 },
        { team1: 6, team2: 4 },
      ],
      description: 'seed_test_data',
      xpAwardedAt: new Date('2026-03-20T22:30:00.000Z'),
      participants: {
        create: [
          { userId: romarioId, slot: 1, team: 1 },
          { userId: aaronId, slot: 2, team: 1 },
          { userId: eduId, slot: 3, team: 2 },
          { userId: karoId, slot: 4, team: 2 },
        ],
      },
    },
  });

  await prisma.match.create({
    data: {
      createdById: romarioId,
      clubName: 'One Padel Trigal',
      playedAt: new Date('2026-03-23T20:00:00.000Z'),
      matchType: MatchType.FRIENDLY,
      status: MatchStatus.COMPLETED,
      winnerTeam: 2,
      games: [
        { team1: 4, team2: 6 },
        { team1: 3, team2: 6 },
      ],
      description: 'seed_test_data',
      xpAwardedAt: new Date('2026-03-23T21:00:00.000Z'),
      participants: {
        create: [
          { userId: romarioId, slot: 1, team: 1 },
          { userId: eduId, slot: 2, team: 1 },
          { userId: loganId, slot: 3, team: 2 },
          { userId: yupiId, slot: 4, team: 2 },
        ],
      },
    },
  });

  await prisma.match.create({
    data: {
      createdById: aaronId,
      clubName: 'Mad Padel Molina',
      playedAt: new Date('2026-03-26T19:30:00.000Z'),
      matchType: MatchType.RANKED,
      status: MatchStatus.DRAFT,
      participants: {
        create: [
          { userId: aaronId, slot: 1, team: 1 },
          { userId: romarioId, slot: 2, team: 1 },
          { userId: loganId, slot: 3, team: 2 },
          { userId: karoId, slot: 4, team: 2 },
        ],
      },
    },
  });

  const demoTournamentPgo = await prisma.tournament.create({
    data: {
      createdById: romarioId,
      title: `${DEMO_TOURNAMENT_PREFIX}Torneo PGO`,
      tournamentType: 'Americano',
      playerCapacity: 12,
      modality: 'Masculino',
      format: 'Dobles',
      location: 'One Padel Olguin',
      address: 'Av. Manuel Olguin 501',
      city: 'Lima',
      district: 'Santiago de Surco',
      startsAt: new Date('2026-04-13T21:30:00.000Z'),
      prize: '1 turno gratis',
      entryFee: 50,
      category: '4TA',
      status: TournamentStatus.PUBLISHED,
      description: 'seed_test_data',
    },
  });

  const demoTournamentInkas = await prisma.tournament.create({
    data: {
      createdById: romarioId,
      title: `${DEMO_TOURNAMENT_PREFIX}Los Inkas`,
      tournamentType: 'Rey de la cancha',
      playerCapacity: 16,
      modality: 'Mixto',
      format: 'Dobles',
      location: 'One Padel Naval',
      address: 'Av. La Marina 1200',
      city: 'Lima',
      district: 'San Miguel',
      startsAt: new Date('2026-04-20T19:00:00.000Z'),
      prize: 'S/ 250 + trofeo',
      entryFee: 60,
      category: '3RA',
      status: TournamentStatus.PUBLISHED,
      description: 'seed_test_data',
    },
  });

  await prisma.tournament.create({
    data: {
      createdById: aaronId,
      title: `${DEMO_TOURNAMENT_PREFIX}Borrador Surco`,
      tournamentType: 'Americano',
      playerCapacity: 8,
      modality: 'Masculino',
      format: 'Singles',
      location: 'Mad Padel Molina',
      address: 'Av. La Molina 999',
      city: 'Lima',
      district: 'La Molina',
      startsAt: new Date('2026-05-05T18:30:00.000Z'),
      prize: 'Kit deportivo',
      entryFee: 45,
      category: '2DA',
      status: TournamentStatus.DRAFT,
      description: 'seed_test_data',
    },
  });

  await prisma.tournamentRegistration.createMany({
    data: [
      {
        tournamentId: demoTournamentPgo.id,
        userId: romarioId,
        partnerUserId: aaronId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: demoTournamentPgo.id,
        userId: eduId,
        partnerUserId: karoId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: demoTournamentPgo.id,
        userId: yupiId,
        mode: TournamentRegistrationMode.SOLO,
        status: TournamentRegistrationStatus.PENDING,
        preferredSide: 'Drive',
        availability: 'Flexible',
      },
      {
        tournamentId: demoTournamentInkas.id,
        userId: loganId,
        partnerUserId: yupiId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: demoTournamentInkas.id,
        userId: romarioId,
        mode: TournamentRegistrationMode.SOLO,
        status: TournamentRegistrationStatus.PENDING,
        preferredSide: 'Reves',
        availability: 'Noche',
      },
    ],
  });

  console.log('Seed demo complete.');
  console.log(`Login demo principal: ${DEMO_EMAIL_PREFIX}romario@pgo.test`);
  console.log(`Password demo: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('seed:demo failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
