import crypto from 'crypto';
import { Router } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/client';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/smtp-users
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const users = await prisma.smtpUser.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, username: true, name: true,
      isActive: true, dailyLimit: true, createdAt: true,
    },
  });
  res.json(users);
});

// POST /api/v1/smtp-users
router.post(
  '/',
  [
    body('username').trim().notEmpty().isLength({ min: 3 }),
    body('name').trim().notEmpty(),
    body('password').isLength({ min: 8 }),
    body('dailyLimit').optional().isInt({ min: 1 }),
  ],
  validate,
  async (req, res) => {
    const { userId } = req as AuthRequest;
    const { username, name, password, dailyLimit } = req.body;

    const existing = await prisma.smtpUser.findUnique({ where: { username } });
    if (existing) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.smtpUser.create({
      data: {
        id: uuidv4(),
        userId,
        username,
        name,
        passwordHash,
        dailyLimit: dailyLimit ?? null,
      },
    });

    res.status(201).json({
      id: user.id,
      username: user.username,
      name: user.name,
      isActive: user.isActive,
      dailyLimit: user.dailyLimit,
      createdAt: user.createdAt,
    });
  }
);

// PATCH /api/v1/smtp-users/:id
router.patch('/:id', async (req, res) => {
  const { userId } = req as AuthRequest;
  const { name, isActive, dailyLimit, password } = req.body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (typeof isActive === 'boolean') updateData.isActive = isActive;
  if (dailyLimit !== undefined) updateData.dailyLimit = dailyLimit ?? null;
  if (password) updateData.passwordHash = await bcrypt.hash(password, 10);

  const updated = await prisma.smtpUser.updateMany({
    where: { id: req.params.id, userId },
    data: updateData,
  });

  if (!updated.count) {
    res.status(404).json({ error: 'SMTP user not found' });
    return;
  }
  res.json({ updated: true });
});

// DELETE /api/v1/smtp-users/:id
router.delete('/:id', async (req, res) => {
  const { userId } = req as AuthRequest;
  const deleted = await prisma.smtpUser.deleteMany({
    where: { id: req.params.id, userId },
  });
  if (!deleted.count) {
    res.status(404).json({ error: 'SMTP user not found' });
    return;
  }
  res.status(204).send();
});

export default router;
