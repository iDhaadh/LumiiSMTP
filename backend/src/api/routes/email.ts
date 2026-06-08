import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/client';
import { emailQueue } from '../../queue/emailQueue';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/v1/email/send
router.post(
  '/send',
  [
    body('from').isEmail(),
    body('to').custom((v) => {
      const arr = Array.isArray(v) ? v : [v];
      if (!arr.every((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
        throw new Error('Invalid recipient address');
      }
      return true;
    }),
    body('subject').notEmpty(),
    body('html').optional().isString(),
    body('text').optional().isString(),
  ],
  validate,
  async (req, res) => {
    const { userId } = req as AuthRequest;
    const { from, to, subject, html, text, headers: extraHeaders } = req.body;

    const toArr: string[] = Array.isArray(to) ? to : [to];
    const messageId = uuidv4();
    const fromDomain = from.split('@')[1];

    const domainRecord = await prisma.domain.findFirst({
      where: { userId, domain: fromDomain, isVerified: true },
    });

    // Build minimal RFC 2822 message
    const headerLines = [
      `Message-ID: <${messageId}@${fromDomain}>`,
      `From: ${from}`,
      `To: ${toArr.join(', ')}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      ...(Object.entries(extraHeaders ?? {}).map(([k, v]) => `${k}: ${v}`)),
    ];

    let emailBody: string;
    if (html) {
      headerLines.push('Content-Type: text/html; charset=utf-8');
      emailBody = html;
    } else {
      headerLines.push('Content-Type: text/plain; charset=utf-8');
      emailBody = text ?? '';
    }

    const rawEmail = `${headerLines.join('\r\n')}\r\n\r\n${emailBody}`;

    const email = await prisma.email.create({
      data: {
        id: uuidv4(),
        userId,
        domainId: domainRecord?.id ?? null,
        messageId,
        fromAddress: from,
        toAddresses: toArr,
        subject,
        status: 'QUEUED',
        size: Buffer.byteLength(rawEmail),
      },
    });

    await emailQueue.add(
      'send',
      {
        emailId: email.id,
        userId,
        rawEmail: Buffer.from(rawEmail).toString('base64'),
        fromAddress: from,
        toAddresses: toArr,
        domainId: domainRecord?.id ?? null,
      },
      { jobId: email.id }
    );

    res.status(202).json({ id: email.id, messageId, status: 'queued' });
  }
);

// GET /api/v1/email/logs
router.get('/logs', async (req, res) => {
  const { userId } = req as AuthRequest;
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1'));
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? '50'));
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const where = {
    userId,
    ...(status ? { status: status as any } : {}),
    ...(search
      ? {
          OR: [
            { fromAddress: { contains: search, mode: 'insensitive' as const } },
            { subject: { contains: search, mode: 'insensitive' as const } },
            { toAddresses: { has: search } },
          ],
        }
      : {}),
  };

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { events: { orderBy: { timestamp: 'desc' }, take: 1 } },
    }),
    prisma.email.count({ where }),
  ]);

  res.json({ data: emails, total, page, limit, pages: Math.ceil(total / limit) });
});

// GET /api/v1/email/stats
router.get('/stats', async (req, res) => {
  const { userId } = req as AuthRequest;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

  const [total, delivered, bounced, opened, clicked] = await Promise.all([
    prisma.email.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.email.count({ where: { userId, status: 'DELIVERED', createdAt: { gte: since } } }),
    prisma.email.count({ where: { userId, status: 'BOUNCED', createdAt: { gte: since } } }),
    prisma.emailEvent.count({
      where: { email: { userId }, eventType: 'OPENED', timestamp: { gte: since } },
    }),
    prisma.emailEvent.count({
      where: { email: { userId }, eventType: 'CLICKED', timestamp: { gte: since } },
    }),
  ]);

  res.json({
    total,
    delivered,
    bounced,
    opened,
    clicked,
    deliveryRate: total ? Math.round((delivered / total) * 100) : 0,
    bounceRate: total ? Math.round((bounced / total) * 100) : 0,
    openRate: delivered ? Math.round((opened / delivered) * 100) : 0,
    clickRate: delivered ? Math.round((clicked / delivered) * 100) : 0,
  });
});

export default router;
