import { Router } from 'express';
import { prisma } from '../../db/client';
import { requireAdmin } from '../middleware/auth';

const router = Router();

// All admin routes require admin flag
router.use(requireAdmin);

// GET /api/v1/admin/users — list all accounts
router.get('/users', async (req, res) => {
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1'));
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? '50'));
  const search = req.query.search as string | undefined;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        isAdmin: true,
        isActive: true,
        dailyLimit: true,
        monthlyLimit: true,
        createdAt: true,
        _count: { select: { emails: true, domains: true, apiKeys: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ data: users, total, page, limit, pages: Math.ceil(total / limit) });
});

// GET /api/v1/admin/users/:id
router.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      domains: true,
      apiKeys: { where: { isActive: true }, select: { id: true, name: true, keyPrefix: true, lastUsed: true, createdAt: true } },
      _count: { select: { emails: true } },
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

// PATCH /api/v1/admin/users/:id — update plan, limits, suspend
router.patch('/users/:id', async (req, res) => {
  const { plan, isActive, dailyLimit, monthlyLimit } = req.body;

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(plan ? { plan } : {}),
      ...(typeof isActive === 'boolean' ? { isActive } : {}),
      ...(dailyLimit ? { dailyLimit } : {}),
      ...(monthlyLimit ? { monthlyLimit } : {}),
    },
    select: { id: true, name: true, email: true, plan: true, isActive: true, dailyLimit: true, monthlyLimit: true },
  });

  res.json(updated);
});

// GET /api/v1/admin/stats — platform-wide stats
router.get('/stats', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalUsers, activeUsers, totalEmails, recentEmails, deliveredEmails] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.email.count(),
    prisma.email.count({ where: { createdAt: { gte: since } } }),
    prisma.email.count({ where: { status: 'DELIVERED', createdAt: { gte: since } } }),
  ]);

  res.json({
    totalUsers,
    activeUsers,
    totalEmails,
    recentEmails,
    deliveredEmails,
    deliveryRate: recentEmails ? Math.round((deliveredEmails / recentEmails) * 100) : 0,
  });
});

export default router;
