import crypto from 'crypto';
import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/client';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../middleware/auth';

const VALID_EVENTS = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'spam_complaint', 'unsubscribed', '*'];

const router = Router();

// GET /api/v1/webhooks
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const hooks = await prisma.webhook.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, url: true, events: true, isActive: true, createdAt: true },
  });
  res.json(hooks);
});

// POST /api/v1/webhooks
router.post(
  '/',
  [
    body('url').isURL(),
    body('events').isArray({ min: 1 }).custom((arr: string[]) => {
      if (!arr.every((e) => VALID_EVENTS.includes(e))) {
        throw new Error(`Invalid events. Allowed: ${VALID_EVENTS.join(', ')}`);
      }
      return true;
    }),
  ],
  validate,
  async (req, res) => {
    const { userId } = req as AuthRequest;
    const { url, events } = req.body;

    const secret = crypto.randomBytes(24).toString('hex');
    const hook = await prisma.webhook.create({
      data: { id: uuidv4(), userId, url, events, secret },
    });

    res.status(201).json({
      id: hook.id,
      url: hook.url,
      events: hook.events,
      secret,
      isActive: hook.isActive,
      createdAt: hook.createdAt,
    });
  }
);

// PATCH /api/v1/webhooks/:id
router.patch('/:id', async (req, res) => {
  const { userId } = req as AuthRequest;
  const { isActive, events, url } = req.body;

  const updated = await prisma.webhook.updateMany({
    where: { id: req.params.id, userId },
    data: {
      ...(typeof isActive === 'boolean' ? { isActive } : {}),
      ...(events ? { events } : {}),
      ...(url ? { url } : {}),
    },
  });

  if (!updated.count) {
    res.status(404).json({ error: 'Webhook not found' });
    return;
  }
  res.json({ updated: true });
});

// DELETE /api/v1/webhooks/:id
router.delete('/:id', async (req, res) => {
  const { userId } = req as AuthRequest;
  const deleted = await prisma.webhook.deleteMany({
    where: { id: req.params.id, userId },
  });
  if (!deleted.count) {
    res.status(404).json({ error: 'Webhook not found' });
    return;
  }
  res.status(204).send();
});

export default router;
