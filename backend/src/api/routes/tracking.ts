import { Router } from 'express';
import { prisma } from '../../db/client';

const router = Router();

const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// GET /t/open/:emailId
router.get('/open/:emailId', async (req, res) => {
  const { emailId } = req.params;

  // Fire and forget — don't block the pixel response
  prisma.emailEvent
    .create({
      data: {
        emailId,
        eventType: 'OPENED',
        metadata: {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
      },
    })
    .catch(() => {});

  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
  });
  res.send(PIXEL);
});

// GET /t/click/:emailId
router.get('/click/:emailId', async (req, res) => {
  const { emailId } = req.params;
  const url = req.query.url as string;

  if (!url) {
    res.status(400).send('Missing url');
    return;
  }

  prisma.emailEvent
    .create({
      data: {
        emailId,
        eventType: 'CLICKED',
        metadata: {
          url,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
      },
    })
    .catch(() => {});

  res.redirect(302, decodeURIComponent(url));
});

// GET /t/unsubscribe/:emailId
router.get('/unsubscribe/:emailId', async (req, res) => {
  const { emailId } = req.params;

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) {
    res.status(404).send('Not found');
    return;
  }

  await prisma.emailEvent.create({
    data: { emailId, eventType: 'UNSUBSCRIBED', metadata: {} },
  });

  // Suppress all recipients of this email
  for (const addr of email.toAddresses) {
    await prisma.suppressionList.upsert({
      where: { userId_email: { userId: email.userId, email: addr.toLowerCase() } },
      update: { reason: 'unsubscribed' },
      create: { userId: email.userId, email: addr.toLowerCase(), reason: 'unsubscribed' },
    });
  }

  res.send('<html><body><h2>You have been unsubscribed.</h2></body></html>');
});

export default router;
