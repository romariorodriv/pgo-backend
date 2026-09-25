import 'dotenv/config';
import { PrismaClient, AdminRole, AdminStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'Administrador PGO';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) fail('DATABASE_URL no configurado.');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  fail('ADMIN_BOOTSTRAP_EMAIL invalido.');
if (
  password.length < 12 ||
  !/[A-Za-z]/.test(password) ||
  !/\d/.test(password) ||
  !/[^A-Za-z0-9]/.test(password)
) {
  fail('ADMIN_BOOTSTRAP_PASSWORD no cumple la politica minima.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const adminEmail = email;

async function main() {
  const existing = await prisma.adminUser.findUnique({
    where: { email: adminEmail },
  });
  if (existing) {
    console.info('Administrador ya existente.');
    return;
  }
  await prisma.adminUser.create({
    data: {
      email: adminEmail,
      name,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      passwordHash: (await bcrypt.hash(password, 10)) as string,
      role: AdminRole.SUPER_ADMIN,
      status: AdminStatus.ACTIVE,
    },
  });
  console.info('Administrador creado.');
}

main()
  .catch(() => fail('No se pudo crear el administrador.'))
  .finally(async () => {
    await prisma.$disconnect();
  });
