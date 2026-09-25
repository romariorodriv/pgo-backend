import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const expiresBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.openMatchChatMessage.deleteMany({
    where: {
      alert: {
        startsAt: {
          lt: expiresBefore,
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        deletedMessages: result.count,
        expiresBefore: expiresBefore.toISOString(),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('cleanup-open-match-chat failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
