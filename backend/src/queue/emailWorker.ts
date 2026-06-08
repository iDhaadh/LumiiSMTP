import dns from 'dns/promises';
import nodemailer from 'nodemailer';
import { Worker, Job } from 'bullmq';
import { prisma } from '../db/client';
import { logger } from '../db/logger';
import { redisConnection, webhookQueue } from './emailQueue';
import { signEmailWithDkim } from '../services/dkim';
import { injectTracking } from '../services/tracking';
import { isSupressed } from '../services/suppression';
import { checkSendingLimit, incrementSendCount } from '../services/rateLimiter';

interface EmailJob {
  emailId: string;
  userId: string;
  rawEmail: string;
  fromAddress: string;
  toAddresses: string[];
  domainId: string | null;
}

async function resolveMx(domain: string): Promise<string[]> {
  try {
    const records = await dns.resolveMx(domain);
    return records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange);
  } catch {
    return [];
  }
}

async function sendToMx(
  mxHost: string,
  from: string,
  to: string,
  rawEmail: Buffer
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: mxHost,
    port: 25,
    secure: false,
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    envelope: { from, to },
    raw: rawEmail,
  });
}

async function processEmailJob(job: Job<EmailJob>) {
  const { emailId, userId, rawEmail: rawBase64, fromAddress, toAddresses, domainId } = job.data;

  // Check per-account rate limits
  const limitCheck = await checkSendingLimit(userId);
  if (!limitCheck.allowed) {
    await prisma.email.update({ where: { id: emailId }, data: { status: 'FAILED' } });
    throw new Error(`Rate limit: ${limitCheck.reason}`);
  }

  await prisma.email.update({ where: { id: emailId }, data: { status: 'SENDING' } });
  await recordEvent(emailId, 'SENT');
  await incrementSendCount(userId, toAddresses.length);

  let rawEmail = Buffer.from(rawBase64, 'base64');

  // Inject open/click tracking
  const trackingDomain = process.env.TRACKING_DOMAIN;
  if (trackingDomain) {
    rawEmail = await injectTracking(rawEmail, emailId, trackingDomain);
  }

  // DKIM sign if domain is configured
  if (domainId) {
    rawEmail = await signEmailWithDkim(rawEmail, domainId);
  }

  const failedRecipients: string[] = [];

  for (const to of toAddresses) {
    // Suppression check
    const suppressed = await isSupressed(userId, to);
    if (suppressed) {
      logger.info(`Skipping suppressed address: ${to}`);
      await recordEvent(emailId, 'BOUNCED', { reason: 'suppressed', email: to });
      continue;
    }

    const recipientDomain = to.split('@')[1];
    const mxHosts = await resolveMx(recipientDomain);

    if (!mxHosts.length) {
      failedRecipients.push(to);
      await recordEvent(emailId, 'BOUNCED', { reason: 'no_mx', email: to });
      continue;
    }

    let sent = false;
    for (const mx of mxHosts) {
      try {
        await sendToMx(mx, fromAddress, to, rawEmail);
        await recordEvent(emailId, 'DELIVERED', { mx, email: to });
        sent = true;
        break;
      } catch (err) {
        logger.warn(`Failed to deliver to ${mx}: ${(err as Error).message}`);
      }
    }

    if (!sent) {
      failedRecipients.push(to);
    }
  }

  const finalStatus = failedRecipients.length === toAddresses.length ? 'FAILED' : 'DELIVERED';
  await prisma.email.update({ where: { id: emailId }, data: { status: finalStatus } });

  // Fire webhooks for this user
  await dispatchWebhooks(userId, emailId, finalStatus);

  if (failedRecipients.length > 0) {
    throw new Error(`Failed recipients: ${failedRecipients.join(', ')}`);
  }
}

async function recordEvent(emailId: string, eventType: string, metadata?: object) {
  await prisma.emailEvent.create({
    data: { emailId, eventType: eventType as any, metadata: metadata ?? {} },
  });
}

async function dispatchWebhooks(userId: string, emailId: string, status: string) {
  const webhooks = await prisma.webhook.findMany({
    where: { userId, isActive: true },
  });

  for (const wh of webhooks) {
    const eventName = status === 'DELIVERED' ? 'delivered' : 'failed';
    if (wh.events.includes(eventName) || wh.events.includes('*')) {
      await webhookQueue.add('fire', {
        url: wh.url,
        secret: wh.secret,
        payload: { event: eventName, emailId, timestamp: new Date().toISOString() },
      });
    }
  }
}

export function startEmailWorker() {
  const worker = new Worker<EmailJob>('email', processEmailJob, {
    connection: redisConnection,
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    logger.info(`Email job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Email job ${job?.id} failed: ${err.message}`);
    if (job) {
      prisma.email
        .update({ where: { id: job.data.emailId }, data: { status: 'FAILED' } })
        .catch(() => {});
    }
  });

  logger.info('Email worker started');
  return worker;
}
