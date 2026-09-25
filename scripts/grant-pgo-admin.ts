import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.PGO_ADMIN_EMAIL?.trim().toLowerCase();

if (!databaseUrl || !email) {
  throw new Error('Configura DATABASE_URL y PGO_ADMIN_EMAIL.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error('No existe un User con ese correo.');

  await prisma.userGlobalRole.upsert({
    where: { userId_role: { userId: user.id, role: 'PGO_ADMIN' } },
    create: { userId: user.id, role: 'PGO_ADMIN' },
    update: {},
  });
  console.info(`PGO_ADMIN asignado a ${user.email}.`);
}

main().finally(async () => prisma.$disconnect());
