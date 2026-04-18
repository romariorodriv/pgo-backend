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
  preferredSide?: string;
  racketModel?: string;
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
    preferredSide: 'Drive',
    racketModel: 'Bullpadel Vertex',
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
    preferredSide: 'Reves',
    racketModel: 'Adidas Metalbone',
    experienceLevel: ExperienceLevel.INTERMEDIATE,
    rankingPosition: 18,
    experiencePoints: 110,
    wins: 3,
    weeklyStreak: 1,
  },
  {
    name: 'Demo Edu',
    email: `${DEMO_EMAIL_PREFIX}edu@pgo.test`,
    category: '4TA',
    preferredClub: 'One Padel Olguin',
    preferredSide: 'Drive',
    racketModel: 'Nox AT10',
    experienceLevel: ExperienceLevel.INTERMEDIATE,
    rankingPosition: 22,
    experiencePoints: 95,
    wins: 2,
    weeklyStreak: 1,
  },
  {
    name: 'Demo Karo',
    email: `${DEMO_EMAIL_PREFIX}karo@pgo.test`,
    category: '3RA',
    preferredClub: 'One Padel Trigal',
    preferredSide: 'Reves',
    racketModel: 'Siux Electra',
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
    preferredSide: 'Drive',
    racketModel: 'Head Delta',
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
    preferredSide: 'Reves',
    racketModel: 'Wilson Bela',
    experienceLevel: ExperienceLevel.PRO,
    rankingPosition: 4,
    experiencePoints: 320,
    wins: 12,
    weeklyStreak: 4,
  },
  {
    name: 'Demo Mafer',
    email: `${DEMO_EMAIL_PREFIX}mafer@pgo.test`,
    category: '4TA',
    preferredClub: 'One Padel Olguin',
    preferredSide: 'Drive',
    racketModel: 'Babolat Technical',
    experienceLevel: ExperienceLevel.INTERMEDIATE,
    rankingPosition: 25,
    experiencePoints: 88,
    wins: 2,
    weeklyStreak: 1,
  },
  {
    name: 'Demo Brisa',
    email: `${DEMO_EMAIL_PREFIX}brisa@pgo.test`,
    category: '4TA',
    preferredClub: 'One Padel Olguin',
    preferredSide: 'Reves',
    racketModel: 'StarVie Triton',
    experienceLevel: ExperienceLevel.INTERMEDIATE,
    rankingPosition: 27,
    experiencePoints: 84,
    wins: 2,
    weeklyStreak: 1,
  },
  {
    name: 'Demo Luna',
    email: `${DEMO_EMAIL_PREFIX}luna@pgo.test`,
    category: '3RA',
    preferredClub: 'One Padel Trigal',
    preferredSide: 'Drive',
    racketModel: 'Nox ML10',
    experienceLevel: ExperienceLevel.ADVANCED,
    rankingPosition: 14,
    experiencePoints: 180,
    wins: 5,
    weeklyStreak: 2,
  },
  {
    name: 'Demo Andrea',
    email: `${DEMO_EMAIL_PREFIX}andrea@pgo.test`,
    category: '3RA',
    preferredClub: 'One Padel Trigal',
    preferredSide: 'Reves',
    racketModel: 'Head Motion',
    experienceLevel: ExperienceLevel.ADVANCED,
    rankingPosition: 15,
    experiencePoints: 176,
    wins: 5,
    weeklyStreak: 2,
  },
  {
    name: 'Demo Cesar',
    email: `${DEMO_EMAIL_PREFIX}cesar@pgo.test`,
    category: '3RA',
    preferredClub: 'One Padel Naval',
    preferredSide: 'Drive',
    racketModel: 'Bullpadel Hack',
    experienceLevel: ExperienceLevel.ADVANCED,
    rankingPosition: 16,
    experiencePoints: 168,
    wins: 4,
    weeklyStreak: 2,
  },
  {
    name: 'Demo Almendra',
    email: `${DEMO_EMAIL_PREFIX}almendra@pgo.test`,
    category: '3RA',
    preferredClub: 'One Padel Naval',
    preferredSide: 'Reves',
    racketModel: 'Adidas Adipower',
    experienceLevel: ExperienceLevel.ADVANCED,
    rankingPosition: 17,
    experiencePoints: 164,
    wins: 4,
    weeklyStreak: 2,
  },
  {
    name: 'Demo Bruno',
    email: `${DEMO_EMAIL_PREFIX}bruno@pgo.test`,
    category: '2DA',
    preferredClub: 'Mad Padel Molina',
    preferredSide: 'Drive',
    racketModel: 'Drop Shot Explorer',
    experienceLevel: ExperienceLevel.PRO,
    rankingPosition: 7,
    experiencePoints: 250,
    wins: 9,
    weeklyStreak: 3,
  },
  {
    name: 'Demo Akira',
    email: `${DEMO_EMAIL_PREFIX}akira@pgo.test`,
    category: '2DA',
    preferredClub: 'Mad Padel Molina',
    preferredSide: 'Reves',
    racketModel: 'Royal Padel M27',
    experienceLevel: ExperienceLevel.PRO,
    rankingPosition: 9,
    experiencePoints: 232,
    wins: 8,
    weeklyStreak: 3,
  },
  {
    name: 'Demo Garufa',
    email: `${DEMO_EMAIL_PREFIX}garufa@pgo.test`,
    category: '2DA',
    preferredClub: 'One Padel Naval',
    preferredSide: 'Drive',
    racketModel: 'Nox Genius',
    experienceLevel: ExperienceLevel.PRO,
    rankingPosition: 11,
    experiencePoints: 226,
    wins: 8,
    weeklyStreak: 3,
  },
  {
    name: 'Demo Jazmin',
    email: `${DEMO_EMAIL_PREFIX}jazmin@pgo.test`,
    category: '2DA',
    preferredClub: 'One Padel Naval',
    preferredSide: 'Reves',
    racketModel: 'Babolat Counter',
    experienceLevel: ExperienceLevel.PRO,
    rankingPosition: 13,
    experiencePoints: 214,
    wins: 7,
    weeklyStreak: 2,
  },
  {
    name: 'Demo Kath',
    email: `${DEMO_EMAIL_PREFIX}kath@pgo.test`,
    category: '4TA',
    preferredClub: 'One Padel Olguin',
    preferredSide: 'Drive',
    racketModel: 'Kuikma LS',
    experienceLevel: ExperienceLevel.BEGINNER,
    rankingPosition: 31,
    experiencePoints: 45,
    wins: 1,
    weeklyStreak: 1,
  },
  {
    name: 'Demo Alessia',
    email: `${DEMO_EMAIL_PREFIX}alessia@pgo.test`,
    category: '4TA',
    preferredClub: 'One Padel Olguin',
    preferredSide: 'Reves',
    racketModel: 'Kuikma PR',
    experienceLevel: ExperienceLevel.BEGINNER,
    rankingPosition: 32,
    experiencePoints: 40,
    wins: 1,
    weeklyStreak: 1,
  },
];

function requireUserId(
  userIds: Map<string, string>,
  email: string,
): string {
  const id = userIds.get(email);
  if (!id) {
    throw new Error(`No se encontro usuario demo para ${email}`);
  }

  return id;
}

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

  if (userIds.length === 0) {
    return;
  }

  await prisma.tournamentRegistration.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { partnerUserId: { in: userIds } },
        {
          tournament: {
            title: {
              startsWith: DEMO_TOURNAMENT_PREFIX,
            },
          },
        },
      ],
    },
  });

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

async function createDemoUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userIds = new Map<string, string>();

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
            preferredSide: seed.preferredSide,
            racketModel: seed.racketModel,
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

    userIds.set(seed.email, user.id);
  }

  return userIds;
}

async function createDemoMatches(userIds: Map<string, string>) {
  const romarioId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}romario@pgo.test`);
  const aaronId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}aaron@pgo.test`);
  const eduId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}edu@pgo.test`);
  const karoId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}karo@pgo.test`);
  const yupiId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}yupi@pgo.test`);
  const loganId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}logan@pgo.test`);
  const maferId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}mafer@pgo.test`);
  const brisaId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}brisa@pgo.test`);
  const lunaId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}luna@pgo.test`);
  const andreaId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}andrea@pgo.test`);

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
      createdById: romarioId,
      clubName: 'Mad Padel Molina',
      playedAt: new Date('2026-03-27T19:00:00.000Z'),
      matchType: MatchType.RANKED,
      status: MatchStatus.COMPLETED,
      winnerTeam: 1,
      games: [
        { team1: 7, team2: 5 },
        { team1: 6, team2: 2 },
      ],
      description: 'seed_test_data',
      xpAwardedAt: new Date('2026-03-27T20:15:00.000Z'),
      participants: {
        create: [
          { userId: romarioId, slot: 1, team: 1 },
          { userId: maferId, slot: 2, team: 1 },
          { userId: brisaId, slot: 3, team: 2 },
          { userId: lunaId, slot: 4, team: 2 },
        ],
      },
    },
  });

  await prisma.match.create({
    data: {
      createdById: aaronId,
      clubName: 'One Padel Naval',
      playedAt: new Date('2026-03-29T18:45:00.000Z'),
      matchType: MatchType.RANKED,
      status: MatchStatus.COMPLETED,
      winnerTeam: 2,
      games: [
        { team1: 2, team2: 6 },
        { team1: 6, team2: 7 },
      ],
      description: 'seed_test_data',
      xpAwardedAt: new Date('2026-03-29T20:00:00.000Z'),
      participants: {
        create: [
          { userId: aaronId, slot: 1, team: 1 },
          { userId: romarioId, slot: 2, team: 1 },
          { userId: andreaId, slot: 3, team: 2 },
          { userId: loganId, slot: 4, team: 2 },
        ],
      },
    },
  });

  await prisma.match.create({
    data: {
      createdById: aaronId,
      clubName: 'Mad Padel Molina',
      playedAt: new Date('2026-04-01T20:30:00.000Z'),
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
}

async function createDemoTournaments(userIds: Map<string, string>) {
  const romarioId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}romario@pgo.test`);
  const aaronId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}aaron@pgo.test`);

  const demoTournamentAdmin = await prisma.tournament.create({
    data: {
      createdById: romarioId,
      title: `${DEMO_TOURNAMENT_PREFIX}Torneo PGO`,
      tournamentType: 'Americano',
      playerCapacity: 18,
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
      registrationsOpen: true,
      description: 'seed_test_data_admin_flow',
    },
  });

  const demoTournamentInscrito = await prisma.tournament.create({
    data: {
      createdById: aaronId,
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
      registrationsOpen: true,
      description: 'seed_test_data_join_flow',
    },
  });

  const demoTournamentDraft = await prisma.tournament.create({
    data: {
      createdById: romarioId,
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
      registrationsOpen: false,
      description: 'seed_test_data_draft_flow',
    },
  });

  const demoTournamentCreated = await prisma.tournament.create({
    data: {
      createdById: romarioId,
      title: `${DEMO_TOURNAMENT_PREFIX}Copa Surco`,
      tournamentType: 'Rey de la cancha',
      playerCapacity: 12,
      modality: 'Masculino',
      format: 'Dobles',
      location: 'One Padel Trigal',
      address: 'Av. Caminos del Inca 1450',
      city: 'Lima',
      district: 'Santiago de Surco',
      startsAt: new Date('2026-04-27T20:00:00.000Z'),
      prize: 'S/ 300',
      entryFee: 55,
      category: '3RA',
      status: TournamentStatus.PUBLISHED,
      registrationsOpen: true,
      description: 'seed_test_data_created_tab',
    },
  });

  const demoTournamentCreatedTwo = await prisma.tournament.create({
    data: {
      createdById: romarioId,
      title: `${DEMO_TOURNAMENT_PREFIX}Liga Nocturna`,
      tournamentType: 'Americano',
      playerCapacity: 16,
      modality: 'Mixto',
      format: 'Dobles',
      location: 'Mad Padel Molina',
      address: 'Av. La Molina 1222',
      city: 'Lima',
      district: 'La Molina',
      startsAt: new Date('2026-05-02T22:00:00.000Z'),
      prize: 'S/ 400 + trofeo',
      entryFee: 65,
      category: '3RA',
      status: TournamentStatus.PUBLISHED,
      registrationsOpen: true,
      description: 'seed_test_data_created_tab_2',
    },
  });

  const demoTournamentDraftTwo = await prisma.tournament.create({
    data: {
      createdById: romarioId,
      title: `${DEMO_TOURNAMENT_PREFIX}Borrador Miraflores`,
      tournamentType: 'Rey de la cancha',
      playerCapacity: 10,
      modality: 'Mixto',
      format: 'Dobles',
      location: 'Club Costa Padel',
      address: 'Av. Del Ejercito 850',
      city: 'Lima',
      district: 'Miraflores',
      startsAt: new Date('2026-05-10T18:00:00.000Z'),
      prize: 'Kit PGO',
      entryFee: 40,
      category: '4TA',
      status: TournamentStatus.DRAFT,
      registrationsOpen: false,
      description: 'seed_test_data_draft_flow_2',
    },
  });

  return {
    demoTournamentAdmin,
    demoTournamentInscrito,
    demoTournamentDraft,
    demoTournamentCreated,
    demoTournamentCreatedTwo,
    demoTournamentDraftTwo,
  };
}

async function createDemoRegistrations(
  userIds: Map<string, string>,
  tournaments: {
    demoTournamentAdmin: { id: string };
    demoTournamentInscrito: { id: string };
    demoTournamentDraft: { id: string };
    demoTournamentCreated: { id: string };
    demoTournamentCreatedTwo: { id: string };
    demoTournamentDraftTwo: { id: string };
  },
) {
  const romarioId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}romario@pgo.test`);
  const aaronId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}aaron@pgo.test`);
  const eduId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}edu@pgo.test`);
  const karoId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}karo@pgo.test`);
  const yupiId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}yupi@pgo.test`);
  const loganId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}logan@pgo.test`);
  const maferId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}mafer@pgo.test`);
  const brisaId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}brisa@pgo.test`);
  const lunaId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}luna@pgo.test`);
  const andreaId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}andrea@pgo.test`);
  const cesarId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}cesar@pgo.test`);
  const almendraId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}almendra@pgo.test`);
  const brunoId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}bruno@pgo.test`);
  const akiraId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}akira@pgo.test`);
  const garufaId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}garufa@pgo.test`);
  const jazminId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}jazmin@pgo.test`);
  const kathId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}kath@pgo.test`);
  const alessiaId = requireUserId(userIds, `${DEMO_EMAIL_PREFIX}alessia@pgo.test`);

  await prisma.tournamentRegistration.createMany({
    data: [
      {
        tournamentId: tournaments.demoTournamentAdmin.id,
        userId: romarioId,
        partnerUserId: aaronId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentAdmin.id,
        userId: eduId,
        partnerUserId: karoId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentAdmin.id,
        userId: yupiId,
        partnerUserId: loganId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentAdmin.id,
        userId: maferId,
        partnerUserId: brisaId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentAdmin.id,
        userId: lunaId,
        partnerUserId: andreaId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentAdmin.id,
        userId: cesarId,
        partnerUserId: almendraId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentAdmin.id,
        userId: brunoId,
        partnerUserId: akiraId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentAdmin.id,
        userId: garufaId,
        partnerUserId: jazminId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentAdmin.id,
        userId: kathId,
        partnerUserId: alessiaId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentInscrito.id,
        userId: romarioId,
        partnerUserId: eduId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentInscrito.id,
        userId: karoId,
        partnerUserId: yupiId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentInscrito.id,
        userId: maferId,
        partnerUserId: brisaId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentInscrito.id,
        userId: lunaId,
        partnerUserId: andreaId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentInscrito.id,
        userId: cesarId,
        partnerUserId: almendraId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentInscrito.id,
        userId: brunoId,
        partnerUserId: akiraId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentInscrito.id,
        userId: garufaId,
        partnerUserId: loganId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentInscrito.id,
        userId: kathId,
        partnerUserId: alessiaId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreated.id,
        userId: lunaId,
        partnerUserId: andreaId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreated.id,
        userId: cesarId,
        partnerUserId: almendraId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreated.id,
        userId: brunoId,
        partnerUserId: akiraId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreated.id,
        userId: garufaId,
        partnerUserId: loganId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreated.id,
        userId: kathId,
        partnerUserId: alessiaId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreated.id,
        userId: romarioId,
        partnerUserId: aaronId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreatedTwo.id,
        userId: romarioId,
        partnerUserId: aaronId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreatedTwo.id,
        userId: eduId,
        partnerUserId: karoId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreatedTwo.id,
        userId: yupiId,
        partnerUserId: loganId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreatedTwo.id,
        userId: maferId,
        partnerUserId: brisaId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreatedTwo.id,
        userId: lunaId,
        partnerUserId: andreaId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreatedTwo.id,
        userId: cesarId,
        partnerUserId: almendraId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreatedTwo.id,
        userId: jazminId,
        partnerUserId: kathId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
      {
        tournamentId: tournaments.demoTournamentCreatedTwo.id,
        userId: alessiaId,
        partnerUserId: brunoId,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
    ],
  });
}

async function main() {
  await cleanupDemoData();

  const userIds = await createDemoUsers();
  await createDemoMatches(userIds);
  const tournaments = await createDemoTournaments(userIds);
  await createDemoRegistrations(userIds, tournaments);

  console.log('Seed demo complete.');
  console.log(`Login demo principal: ${DEMO_EMAIL_PREFIX}romario@pgo.test`);
  console.log(`Password demo: ${DEMO_PASSWORD}`);
  console.log(
    'Escenario demo: torneos creados, borradores, inscritos, admin con cruces y jugadores suficientes.',
  );
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
