import { prisma } from '../db/client';

export async function isSupressed(userId: string, email: string): Promise<boolean> {
  const entry = await prisma.suppressionList.findUnique({
    where: { userId_email: { userId, email: email.toLowerCase() } },
  });
  return !!entry;
}

export async function addSuppression(
  userId: string,
  email: string,
  reason: string,
  bounceType?: 'HARD' | 'SOFT'
): Promise<void> {
  await prisma.suppressionList.upsert({
    where: { userId_email: { userId, email: email.toLowerCase() } },
    update: { reason, bounceType: bounceType ?? null },
    create: { userId, email: email.toLowerCase(), reason, bounceType: bounceType ?? null },
  });
}

export async function removeSuppression(userId: string, email: string): Promise<void> {
  await prisma.suppressionList.deleteMany({
    where: { userId, email: email.toLowerCase() },
  });
}
