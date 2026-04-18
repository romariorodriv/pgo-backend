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
const PLAYER_EMAILS = ['demo_yupi@pgo.test', 'demo_mafer@pgo.test'];

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, name: true },
  });

  if (!admin) {
    throw new Error(`No se encontro el admin ${ADMIN_EMAIL}.`);
  }

  let players = await prisma.user.findMany({
    where: { email: { in: PLAYER_EMAILS } },
    select: { id: true, email: true, name: true },
  });

  if (players.length < 2) {
    players = await prisma.user.findMany({
      where: { id: { not: admin.id } },
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
  }

  if (players.length < 2) {
    throw new Error('No hay suficientes usuarios para crear el torneo de prueba.');
  }

  const now = new Date();
  const startsAt = new Date(now.getTime() + 1000 * 60 * 60 * 24);
  const tag = now.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const title = `[DEMO] Pairing 2P ${tag}`;

  const tournament = await prisma.tournament.create({
    data: {
      createdById: admin.id,
      title,
      tournamentType: 'Americano',
      playerCapacity: 2,
      modality: 'Masculino',
      format: 'Dobles',
      location: 'One Padel Olguin',
      address: 'Av. Manuel Olguin 325',
      city: 'Lima',
      district: 'Santiago de Surco',
      startsAt,
      prize: '1 turno gratis',
      entryFee: 0,
      category: '4TA',
      description: 'Torneo demo con 2 jugadores sin pareja para pruebas de emparejamiento.',
      status: TournamentStatus.PUBLISHED,
      registrationsOpen: true,
    },
    select: { id: true, title: true, playerCapacity: true },
  });

  await prisma.tournamentRegistration.createMany({
    data: [
      {
        tournamentId: tournament.id,
        userId: players[0].id,
        mode: TournamentRegistrationMode.SOLO,
        status: TournamentRegistrationStatus.PENDING,
        preferredSide: 'INDISTINTO',
        availability: 'NOCHE',
      },
      {
        tournamentId: tournament.id,
        userId: players[1].id,
        mode: TournamentRegistrationMode.SOLO,
        status: TournamentRegistrationStatus.PENDING,
        preferredSide: 'INDISTINTO',
        availability: 'NOCHE',
      },
    ],
  });

  console.log('Seed pairing 2P completado');
  console.log(
    JSON.stringify(
      {
        tournament,
        admin,
        players,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('seed:pairing-2p failed');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
