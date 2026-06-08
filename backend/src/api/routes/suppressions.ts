import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../../db/client';
import { addSuppression, removeSuppression } from '../../services/suppression';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/suppressions
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1'));
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? '50'));

  const [entries, total] = await Promise.all([
    prisma.suppressionList.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.suppressionList.count({ where: { userId } }),
  ]);

  res.json({ data: entries, total, page, limit, pages: Math.ceil(total / limit) });
});

// POST /api/v1/suppressions
router.post(
  '/',
  [body('email').isEmail().normalizeEmail(), body('reason').notEmpty()],
  validate,
  async (req, res) => {
    const { userId } = req as AuthRequest;
    const { email, reason } = req.body;
    await addSuppression(userId, email, reason);
    res.status(201).json({ email, reason });
  }
);

// DELETE /api/v1/suppressions/:email
router.delete('/:email', async (req, res) => {
  const { userId } = req as AuthRequest;
  await removeSuppression(userId, decodeURIComponent(req.params.email));
  res.status(204).send();
});

export default router;
