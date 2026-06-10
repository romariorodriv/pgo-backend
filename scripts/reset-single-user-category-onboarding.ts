import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type Mode = 'dry-run' | 'apply';
type EnvName = 'local' | 'dev' | 'staging' | 'production';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no esta definida en el entorno actual.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const resetFields = {
  category: null,
  categoryOrigin: null,
  categoryIsProvisional: false,
  categorySuggested: null,
  categoryPreliminary: null,
  categoryMaxApplied: null,
  categoryScore: null,
  categoryQuizAnswers: Prisma.DbNull,
  hasCompletedInitialOnboarding: false,
};

function parseArgs(argv: string[]) {
  let mode: Mode = 'dry-run';
  let email = '';
  let env: EnvName | undefined;
  let allowProduction = false;

  for (const arg of argv) {
    if (arg === '--apply') mode = 'apply';
    if (arg === '--dry-run') mode = 'dry-run';
    if (arg.startsWith('--email=')) {
      email = arg.split('=')[1]?.trim() ?? '';
    }
    if (arg.startsWith('--env=')) {
      env = arg.split('=')[1] as EnvName;
    }
    if (arg === '--allow-production') {
      allowProduction = true;
    }
  }

  return { mode, email, env, allowProduction };
}

function inferEnvFromUrl(url: string): EnvName {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(host)) return 'local';
    if (host.includes('staging')) return 'staging';
    if (host.includes('dev')) return 'dev';
    return 'production';
  } catch {
    return 'production';
  }
}

async function main() {
  const { mode, email, env, allowProduction } = parseArgs(process.argv.slice(2));
  if (!email) {
    throw new Error('Falta --email=usuario@correo.com');
  }

  const inferredEnv = inferEnvFromUrl(connectionString!);
  const effectiveEnv = env ?? inferredEnv;
  if (effectiveEnv === 'production' && mode === 'apply' && !allowProduction) {
    throw new Error('Abortado: production requiere --allow-production para aplicar cambios.');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      profile: {
        select: {
          category: true,
          categoryOrigin: true,
          categoryIsProvisional: true,
          categorySuggested: true,
          categoryPreliminary: true,
          categoryMaxApplied: true,
          categoryScore: true,
          categoryQuizAnswers: true,
          hasCompletedInitialOnboarding: true,
        },
      },
    },
  });

  if (!user) {
    console.log(`Usuario no encontrado: ${email}`);
    return;
  }

  const current = user.profile;
  console.log(`ENV detectado: ${effectiveEnv} (DATABASE_URL -> ${inferredEnv})`);
  console.log(`Usuario: ${user.email} (${user.name})`);
  console.log(`Modo: ${mode}`);
  console.log(`Perfil existe: ${current ? 'si' : 'no'}`);
  console.log(
    `Estado actual: ${JSON.stringify(
      {
        category: current?.category ?? null,
        categoryOrigin: current?.categoryOrigin ?? null,
        categoryIsProvisional: current?.categoryIsProvisional ?? false,
        categorySuggested: current?.categorySuggested ?? null,
        categoryPreliminary: current?.categoryPreliminary ?? null,
        categoryMaxApplied: current?.categoryMaxApplied ?? null,
        categoryScore: current?.categoryScore ?? null,
        categoryQuizAnswers:
          current?.categoryQuizAnswers && typeof current.categoryQuizAnswers === 'object'
            ? 'present'
            : null,
        hasCompletedInitialOnboarding:
          current?.hasCompletedInitialOnboarding ?? false,
      },
      null,
      2,
    )}`,
  );

  if (mode === 'dry-run') {
    console.log(
      `Dry-run: se resetearían solo los campos del perfil de ${email}. Sin tocar usuario, email, password, nombre, foto, teléfono, amigos, torneos, partidos ni notificaciones.`,
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.profile.updateMany({
      where: { userId: user.id },
      data: resetFields,
    });
  });

  console.log(`Reset aplicado solo al perfil de ${email}.`);
}

main()
  .catch((error) => {
    console.error('reset-single-user-category-onboarding failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
