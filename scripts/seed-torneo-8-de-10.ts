import 'dotenv/config';
import {
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

const ADMIN_EMAIL = 'demo_romario@pgo.test';
const TITLE = 'torneo pruebas';

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, name: true },
  });

  if (!admin) {
    throw new Error(`No se encontro el admin ${ADMIN_EMAIL}.`);
  }

  await prisma.tournamentRegistration.deleteMany({
    where: {
      tournament: {
        createdById: admin.id,
        title: TITLE,
      },
    },
  });

  await prisma.tournament.deleteMany({
    where: {
      createdById: admin.id,
      title: TITLE,
    },
  });

  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 3);
  startsAt.setHours(21, 30, 0, 0);

  const tournament = await prisma.tournament.create({
    data: {
      createdById: admin.id,
      title: TITLE,
      tournamentType: 'Americano',
      playerCapacity: 10,
      modality: 'Masculino',
      format: 'Dobles',
      location: 'One Padel Olguin',
      address: 'Av. Manuel Olguin 325',
      city: 'Lima',
      district: 'Santiago de Surco',
      startsAt,
      prize: '1 turno gratis',
      entryFee: 50,
      category: '4TA',
      status: TournamentStatus.PUBLISHED,
      registrationsOpen: true,
      description: 'seed_torneo_8_de_10',
    },
    select: { id: true, title: true, playerCapacity: true, createdById: true },
  });

  const users = await prisma.user.findMany({
    where: { id: { not: admin.id } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true },
    take: 8,
  });

  if (users.length < 8) {
    throw new Error('No hay al menos 8 usuarios para inscribir.');
  }

  const registrations = [
    [users[0], users[1]],
    [users[2], users[3]],
    [users[4], users[5]],
    [users[6], users[7]],
  ];

  for (const [user, partner] of registrations) {
    await prisma.tournamentRegistration.create({
      data: {
        tournamentId: tournament.id,
        userId: user.id,
        partnerUserId: partner.id,
        mode: TournamentRegistrationMode.WITH_PARTNER,
        status: TournamentRegistrationStatus.CONFIRMED,
      },
    });
  }

  const active = await prisma.tournamentRegistration.findMany({
    where: {
      tournamentId: tournament.id,
      status: { not: TournamentRegistrationStatus.CANCELED },
    },
    select: { userId: true, partnerUserId: true },
  });

  const uniquePlayers = new Set<string>();
  for (const entry of active) {
    uniquePlayers.add(entry.userId);
    if (entry.partnerUserId) uniquePlayers.add(entry.partnerUserId);
  }

  console.log('Torneo creado para pruebas:');
  console.log(`- id: ${tournament.id}`);
  console.log(`- titulo: ${tournament.title}`);
  console.log(`- admin: ${admin.email}`);
  console.log(`- inscritos: ${uniquePlayers.size} de ${tournament.playerCapacity}`);
}

main()
  .catch((error) => {
    console.error('seed torneo 8 de 10 failed');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
