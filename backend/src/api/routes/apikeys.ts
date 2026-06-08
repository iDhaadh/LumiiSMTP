import crypto from 'crypto';
import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/client';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../middleware/auth';
import { encryptKey, decryptKey } from '../../services/keyEncryption';

const router = Router();

// GET /api/v1/apikeys
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const keys = await prisma.apiKey.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true, keyPrefix: true, encryptedKey: true, name: true, lastUsed: true, createdAt: true },
  });
  res.json(
    keys.map((k) => ({
      ...k,
      fullKey: k.encryptedKey ? decryptKey(k.encryptedKey) : null,
      encryptedKey: undefined,
    }))
  );
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
    const encryptedKey = encryptKey(rawKey);

    const record = await prisma.apiKey.create({
      data: { id: uuidv4(), userId, keyHash, keyPrefix, encryptedKey, name },
    });

    res.status(201).json({
      id: record.id,
      name: record.name,
      keyPrefix,
      fullKey: rawKey,
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
