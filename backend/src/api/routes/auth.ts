import crypto from 'crypto';
import { Router } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/client';
import { validate } from '../middleware/validate';

const router = Router();

// POST /api/v1/auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty(),
    body('email').isEmail({ require_tld: false }).normalizeEmail({ gmail_dots: false }),
    body('password').isLength({ min: 8 }),
  ],
  validate,
  async (req, res) => {
    const { name, email, password } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { id: uuidv4(), name, email, passwordHash },
    });

    // Create default API key
    const rawKey = `sk_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    await prisma.apiKey.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        keyHash,
        keyPrefix: rawKey.slice(0, 10),
        name: 'Default',
      },
    });

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET ?? 'secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      apiKey: rawKey,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
    });
  }
);

// POST /api/v1/auth/login
router.post(
  '/login',
  [body('email').isEmail({ require_tld: false }).normalizeEmail({ gmail_dots: false }), body('password').notEmpty()],
  validate,
  async (req, res) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email, isActive: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET ?? 'secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, isAdmin: user.isAdmin },
    });
  }
);

export default router;
