import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
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

async function main() {
  const demoUsers = await prisma.user.findMany({
    where: {
      email: {
        startsWith: DEMO_EMAIL_PREFIX,
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  const demoUserIds = demoUsers.map((user) => user.id);

  const demoMatches = await prisma.match.findMany({
    where: {
      OR: [
        {
          createdById: {
            in: demoUserIds,
          },
        },
        {
          participants: {
            some: {
              userId: {
                in: demoUserIds,
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  const demoMatchIds = demoMatches.map((match) => match.id);

  if (demoMatchIds.length > 0) {
    await prisma.matchParticipant.deleteMany({
      where: {
        matchId: {
          in: demoMatchIds,
        },
      },
    });

    await prisma.match.deleteMany({
      where: {
        id: {
          in: demoMatchIds,
        },
      },
    });
  }

  if (demoUserIds.length > 0) {
    await prisma.tournamentRegistration.deleteMany({
      where: {
        OR: [
          {
            userId: {
              in: demoUserIds,
            },
          },
          {
            partnerUserId: {
              in: demoUserIds,
            },
          },
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
  }

  await prisma.tournament.deleteMany({
    where: {
      OR: [
        {
          title: {
            startsWith: DEMO_TOURNAMENT_PREFIX,
          },
        },
        {
          createdById: {
            in: demoUserIds,
          },
        },
      ],
    },
  });

  if (demoUserIds.length > 0) {
    await prisma.profile.deleteMany({
      where: {
        userId: {
          in: demoUserIds,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: demoUserIds,
        },
      },
    });
  }

  console.log(
    `Cleanup demo complete: ${demoUsers.length} users, ${demoMatchIds.length} matches removed.`,
  );
}

main()
  .catch((error) => {
    console.error('cleanup:demo failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
