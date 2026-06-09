import { prisma } from '../db/client';

const devCounters = new Map<string, number>();

function devIncr(key: string, by: number) {
  devCounters.set(key, (devCounters.get(key) ?? 0) + by);
}

function devGet(key: string): number {
  return devCounters.get(key) ?? 0;
}

export async function checkSendingLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  // Unrestricted mode: skip daily/monthly caps entirely.
  if (process.env.DISABLE_RATE_LIMIT === 'true') return { allowed: true };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyLimit: true, monthlyLimit: true },
  });
  if (!user) return { allowed: false, reason: 'user_not_found' };

  const now = new Date();
  const dayKey = `ratelimit:daily:${userId}:${now.toISOString().slice(0, 10)}`;
  const monthKey = `ratelimit:monthly:${userId}:${now.toISOString().slice(0, 7)}`;

  let dailyCount: number;
  let monthlyCount: number;

  if (process.env.QUEUE_ENABLED === 'false') {
    dailyCount = devGet(dayKey);
    monthlyCount = devGet(monthKey);
  } else {
    const { redisConnection } = await import('../queue/emailQueue');
    const [daily, monthly] = await Promise.all([
      redisConnection.get(dayKey),
      redisConnection.get(monthKey),
    ]);
    dailyCount = parseInt(daily ?? '0');
    monthlyCount = parseInt(monthly ?? '0');
  }

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

  if (process.env.QUEUE_ENABLED === 'false') {
    devIncr(dayKey, count);
    devIncr(monthKey, count);
    return;
  }

  const { redisConnection } = await import('../queue/emailQueue');
  const pipeline = redisConnection.pipeline();
  pipeline.incrby(dayKey, count);
  pipeline.expire(dayKey, 86400 + 3600);
  pipeline.incrby(monthKey, count);
  pipeline.expire(monthKey, 31 * 86400 + 3600);
  await pipeline.exec();
}
