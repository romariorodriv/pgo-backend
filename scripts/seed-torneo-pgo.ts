import 'dotenv/config';
import {
  Prisma,
  PrismaClient,
  TournamentRegistrationMode,
  TournamentRegistrationStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL no esta definida en el entorno actual.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const demoEmails = [
  'demo_romario@pgo.test',
  'demo_aaron@pgo.test',
  'demo_edu@pgo.test',
  'demo_karo@pgo.test',
  'demo_yupi@pgo.test',
  'demo_logan@pgo.test',
  'demo_mafer@pgo.test',
  'demo_brisa@pgo.test',
  'demo_luna@pgo.test',
  'demo_andrea@pgo.test',
  'demo_cesar@pgo.test',
  'demo_almendra@pgo.test',
  'demo_bruno@pgo.test',
  'demo_akira@pgo.test',
  'demo_garufa@pgo.test',
  'demo_jazmin@pgo.test',
];

const pairs: Array<[string, string]> = [
  ['demo_romario@pgo.test', 'demo_aaron@pgo.test'],
  ['demo_edu@pgo.test', 'demo_karo@pgo.test'],
  ['demo_yupi@pgo.test', 'demo_logan@pgo.test'],
  ['demo_mafer@pgo.test', 'demo_brisa@pgo.test'],
  ['demo_luna@pgo.test', 'demo_andrea@pgo.test'],
  ['demo_cesar@pgo.test', 'demo_almendra@pgo.test'],
  ['demo_bruno@pgo.test', 'demo_akira@pgo.test'],
  ['demo_garufa@pgo.test', 'demo_jazmin@pgo.test'],
];

async function main() {
  const tournament = await prisma.tournament.findFirst({
    where: {
      title: { contains: 'Torneo PGO', mode: 'insensitive' },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!tournament) {
    throw new Error('No se encontro el torneo "Torneo PGO".');
  }

  const users = await prisma.user.findMany({
    where: { email: { in: demoEmails } },
    select: { id: true, email: true },
  });

  const userIdByEmail = new Map(users.map((user) => [user.email, user.id]));

  await prisma.tournamentRegistration.deleteMany({
    where: { tournamentId: tournament.id },
  });

  const data: Prisma.TournamentRegistrationCreateManyInput[] = [];

  for (const [userEmail, partnerEmail] of pairs) {
    const userId = userIdByEmail.get(userEmail);
    const partnerUserId = userIdByEmail.get(partnerEmail);
    if (!userId || !partnerUserId) continue;
    data.push({
      tournamentId: tournament.id,
      userId,
      partnerUserId,
      mode: TournamentRegistrationMode.WITH_PARTNER,
      status: TournamentRegistrationStatus.CONFIRMED,
    });
  }

  if (data.length === 0) {
    throw new Error('No se encontraron usuarios demo para registrar.');
  }

  await prisma.tournamentRegistration.createMany({ data });

  console.log(
    `Seed torneo PGO completo: ${data.length * 2} jugadores registrados.`,
  );
}

main()
  .catch((error) => {
    console.error('seed:torneo-pgo failed');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
