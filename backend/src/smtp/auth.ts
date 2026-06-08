import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/client';

export async function authenticateApiKey(key: string): Promise<string | null> {
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash, isActive: true },
    include: { user: { select: { id: true, isActive: true } } },
  });
  if (!apiKey || !apiKey.user.isActive) return null;

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsed: new Date() },
  });

  return apiKey.userId;
}

export async function authenticateSmtpCredentials(
  username: string,
  password: string
): Promise<string | null> {
  // Check dedicated SMTP users first
  const smtpUser = await prisma.smtpUser.findUnique({
    where: { username, isActive: true },
    include: { user: { select: { id: true, isActive: true } } },
  });
  if (smtpUser && smtpUser.user.isActive) {
    const valid = await bcrypt.compare(password, smtpUser.passwordHash);
    if (valid) return smtpUser.userId;
  }

  // Fall back to account credentials (email + password)
  const user = await prisma.user.findUnique({
    where: { email: username, isActive: true },
  });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user.id : null;
}
