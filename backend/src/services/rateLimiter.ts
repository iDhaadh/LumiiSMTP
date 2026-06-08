import { redisConnection } from '../queue/emailQueue';
import { prisma } from '../db/client';

export async function checkSendingLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyLimit: true, monthlyLimit: true },
  });
  if (!user) return { allowed: false, reason: 'user_not_found' };

  const now = new Date();
  const dayKey = `ratelimit:daily:${userId}:${now.toISOString().slice(0, 10)}`;
  const monthKey = `ratelimit:monthly:${userId}:${now.toISOString().slice(0, 7)}`;

  const [daily, monthly] = await Promise.all([
    redisConnection.get(dayKey),
    redisConnection.get(monthKey),
  ]);

  const dailyCount = parseInt(daily ?? '0');
  const monthlyCount = parseInt(monthly ?? '0');

  if (dailyCount >= user.dailyLimit) {
    return { allowed: false, reason: `daily_limit_exceeded (${dailyCount}/${user.dailyLimit})` };
  }
  if (monthlyCount >= user.monthlyLimit) {
    return { allowed: false, reason: `monthly_limit_exceeded (${monthlyCount}/${user.monthlyLimit})` };
  }

  return { allowed: true };
}

export async function incrementSendCount(userId: string, count = 1): Promise<void> {
  const now = new Date();
  const dayKey = `ratelimit:daily:${userId}:${now.toISOString().slice(0, 10)}`;
  const monthKey = `ratelimit:monthly:${userId}:${now.toISOString().slice(0, 7)}`;

  const pipeline = redisConnection.pipeline();
  pipeline.incrby(dayKey, count);
  pipeline.expire(dayKey, 86400 + 3600); // 25h TTL
  pipeline.incrby(monthKey, count);
  pipeline.expire(monthKey, 31 * 86400 + 3600); // 32d TTL
  await pipeline.exec();
}
