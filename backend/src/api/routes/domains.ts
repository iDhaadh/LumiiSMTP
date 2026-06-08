import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/client';
import { generateDkimKeys, verifyDomainDns } from '../../services/dkim';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/domains
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const domains = await prisma.domain.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(domains);
});

// POST /api/v1/domains
router.post(
  '/',
  [body('domain').isFQDN()],
  validate,
  async (req, res) => {
    const { userId } = req as AuthRequest;
    const { domain } = req.body;

    const existing = await prisma.domain.findUnique({
      where: { userId_domain: { userId, domain } },
    });
    if (existing) {
      res.status(409).json({ error: 'Domain already added' });
      return;
    }

    const record = await prisma.domain.create({
      data: { id: uuidv4(), userId, domain },
    });

    res.status(201).json(record);
  }
);

// DELETE /api/v1/domains/:id
router.delete('/:id', async (req, res) => {
  const { userId } = req as AuthRequest;
  const deleted = await prisma.domain.deleteMany({
    where: { id: req.params.id, userId },
  });
  if (!deleted.count) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }
  res.status(204).send();
});

// POST /api/v1/domains/:id/dkim
router.post('/:id/dkim', async (req, res) => {
  const { userId } = req as AuthRequest;
  const domain = await prisma.domain.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!domain) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }

  const keys = await generateDkimKeys(domain.id);
  res.json({
    selector: keys.selector,
    dnsRecord: keys.dnsRecord,
    dnsName: `${keys.selector}._domainkey.${domain.domain}`,
    publicKey: keys.publicKey,
  });
});

// GET /api/v1/domains/verify?domainId=...
router.get('/verify', async (req, res) => {
  const { userId } = req as AuthRequest;
  const domainId = req.query.domainId as string;
  if (!domainId) {
    res.status(400).json({ error: 'domainId query param required' });
    return;
  }

  const domain = await prisma.domain.findFirst({ where: { id: domainId, userId } });
  if (!domain) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }

  const results = await verifyDomainDns(domainId);
  res.json({ domain: domain.domain, ...results });
});

export default router;
