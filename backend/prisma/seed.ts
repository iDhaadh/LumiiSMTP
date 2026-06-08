import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@localhost' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@localhost',
      passwordHash,
      plan: 'ENTERPRISE',
      isAdmin: true,
      dailyLimit: 1000000,
      monthlyLimit: 10000000,
    },
  });

  const rawKey = `sk_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);

  await prisma.apiKey.upsert({
    where: { keyHash },
    update: {},
    create: {
      userId: admin.id,
      keyHash,
      keyPrefix,
      name: 'Default Admin Key',
    },
  });

  console.log('Seed complete');
  console.log(`Admin email: admin@localhost`);
  console.log(`Admin password: admin123`);
  console.log(`API key: ${rawKey}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
