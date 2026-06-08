import dns from 'dns/promises';
import nodemailer from 'nodemailer';
import { prisma } from '../db/client';
import { logger } from '../db/logger';
import { signEmailWithDkim } from '../services/dkim';
import { injectTracking } from '../services/tracking';
import { isSupressed } from '../services/suppression';
import { checkSendingLimit, incrementSendCount } from '../services/rateLimiter';

export interface EmailJobData {
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
    return records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  } catch {
    return [];
  }
}

function getRelayTransport() {
  const host = process.env.SMTP_RELAY_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_RELAY_PORT ?? '587'),
    secure: process.env.SMTP_RELAY_PORT === '465',
    auth: process.env.SMTP_RELAY_USER
      ? { user: process.env.SMTP_RELAY_USER, pass: process.env.SMTP_RELAY_PASS }
      : undefined,
    tls: { rejectUnauthorized: false },
  });
}

async function sendToMx(mxHost: string, from: string, to: string, rawEmail: Buffer): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: mxHost,
    port: 25,
    secure: false,
    tls: { rejectUnauthorized: false },
  });
  await transporter.sendMail({ envelope: { from, to }, raw: rawEmail });
}

async function sendViaRelay(from: string, to: string, rawEmail: Buffer): Promise<void> {
  const transporter = getRelayTransport()!;
  await transporter.sendMail({ envelope: { from, to }, raw: rawEmail });
}

async function recordEvent(emailId: string, eventType: string, metadata?: object) {
  await prisma.emailEvent.create({
    data: { emailId, eventType: eventType as any, metadata: metadata ?? {} },
  });
}

async function dispatchWebhooks(userId: string, emailId: string, status: string) {
  const webhooks = await prisma.webhook.findMany({ where: { userId, isActive: true } });
  for (const wh of webhooks) {
    const eventName = status === 'DELIVERED' ? 'delivered' : 'failed';
    if (wh.events.includes(eventName) || wh.events.includes('*')) {
      if (process.env.QUEUE_ENABLED !== 'false') {
        const { webhookQueue } = await import('./emailQueue');
        await webhookQueue.add('fire', {
          url: wh.url,
          secret: wh.secret,
          payload: { event: eventName, emailId, timestamp: new Date().toISOString() },
        });
      }
    }
  }
}

export async function processEmailJobData(data: EmailJobData): Promise<void> {
  const { emailId, userId, rawEmail: rawBase64, fromAddress, toAddresses, domainId } = data;

  const limitCheck = await checkSendingLimit(userId);
  if (!limitCheck.allowed) {
    await prisma.email.update({ where: { id: emailId }, data: { status: 'FAILED' } });
    throw new Error(`Rate limit: ${limitCheck.reason}`);
  }

  await prisma.email.update({ where: { id: emailId }, data: { status: 'SENDING' } });
  await recordEvent(emailId, 'SENT');
  await incrementSendCount(userId, toAddresses.length);

  let rawEmail = Buffer.from(rawBase64, 'base64');

  const trackingDomain = process.env.TRACKING_DOMAIN;
  if (trackingDomain) {
    rawEmail = await injectTracking(rawEmail, emailId, trackingDomain);
  }

  if (domainId) {
    rawEmail = await signEmailWithDkim(rawEmail, domainId);
  }

  const failedRecipients: string[] = [];

  for (const to of toAddresses) {
    const suppressed = await isSupressed(userId, to);
    if (suppressed) {
      logger.info(`Skipping suppressed address: ${to}`);
      await recordEvent(emailId, 'BOUNCED', { reason: 'suppressed', email: to });
      continue;
    }

    // Smarthost relay mode — route through configured upstream SMTP
    if (process.env.SMTP_RELAY_HOST) {
      try {
        await sendViaRelay(fromAddress, to, rawEmail);
        await recordEvent(emailId, 'DELIVERED', { relay: process.env.SMTP_RELAY_HOST, email: to });
      } catch (err) {
        const msg = (err as Error).message;
        logger.warn(`Relay delivery failed for ${to}: ${msg}`);
        failedRecipients.push(to);
        await recordEvent(emailId, 'BOUNCED', { reason: 'relay_failed', email: to, error: msg });
      }
      continue;
    }

    // Direct MX delivery mode
    const recipientDomain = to.split('@')[1];
    const mxHosts = await resolveMx(recipientDomain);

    if (!mxHosts.length) {
      failedRecipients.push(to);
      await recordEvent(emailId, 'BOUNCED', { reason: 'no_mx', email: to });
      continue;
    }

    let sent = false;
    const mxErrors: string[] = [];
    for (const mx of mxHosts) {
      try {
        await sendToMx(mx, fromAddress, to, rawEmail);
        await recordEvent(emailId, 'DELIVERED', { mx, email: to });
        sent = true;
        break;
      } catch (err) {
        const msg = (err as Error).message;
        mxErrors.push(`${mx}: ${msg}`);
        logger.warn(`Failed to deliver to ${mx}: ${msg}`);
      }
    }

    if (!sent) {
      failedRecipients.push(to);
      await recordEvent(emailId, 'BOUNCED', { reason: 'delivery_failed', email: to, errors: mxErrors });
    }
  }

  const finalStatus = failedRecipients.length === toAddresses.length ? 'FAILED' : 'DELIVERED';
  await prisma.email.update({ where: { id: emailId }, data: { status: finalStatus } });
  await dispatchWebhooks(userId, emailId, finalStatus);

  if (failedRecipients.length > 0) {
    throw new Error(`Failed recipients: ${failedRecipients.join(', ')}`);
  }
}
