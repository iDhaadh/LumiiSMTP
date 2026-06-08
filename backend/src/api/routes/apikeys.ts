import crypto from 'crypto';
import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/client';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/apikeys
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const keys = await prisma.apiKey.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true, keyPrefix: true, name: true, lastUsed: true, createdAt: true },
  });
  res.json(keys);
});

// POST /api/v1/apikeys
router.post(
  '/',
  [body('name').trim().notEmpty()],
  validate,
  async (req, res) => {
    const { userId } = req as AuthRequest;
    const { name } = req.body;

    const rawKey = `sk_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10);

    const record = await prisma.apiKey.create({
      data: { id: uuidv4(), userId, keyHash, keyPrefix, name },
    });

    // Return raw key once — never stored in plaintext again
    res.status(201).json({
      id: record.id,
      name: record.name,
      keyPrefix,
      key: rawKey,
      createdAt: record.createdAt,
    });
  }
);

// DELETE /api/v1/apikeys/:id
router.delete('/:id', async (req, res) => {
  const { userId } = req as AuthRequest;
  const deleted = await prisma.apiKey.updateMany({
    where: { id: req.params.id, userId },
    data: { isActive: false },
  });
  if (!deleted.count) {
    res.status(404).json({ error: 'API key not found' });
    return;
  }
  res.status(204).send();
});

export default router;
