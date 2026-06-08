import { simpleParser } from 'mailparser';
import { prisma } from '../db/client';
import { addSuppression } from './suppression';
import { logger } from '../db/logger';

const HARD_BOUNCE_CODES = new Set(['550', '551', '552', '553', '554', '521']);
const SOFT_BOUNCE_CODES = new Set(['421', '450', '451', '452']);

interface BounceResult {
  email: string;
  type: 'HARD' | 'SOFT' | 'COMPLAINT';
  statusCode?: string;
  reason?: string;
}

export async function processBounceEmail(rawEmail: Buffer): Promise<BounceResult[]> {
  const parsed = await simpleParser(rawEmail);
  const results: BounceResult[] = [];

  // Check for DSN (Delivery Status Notification)
  const isDeliveryStatus =
    parsed.headers.get('content-type')?.toString().includes('multipart/report') ||
    parsed.headers.get('content-type')?.toString().includes('delivery-status');

  if (isDeliveryStatus && parsed.attachments) {
    for (const attachment of parsed.attachments) {
      if (attachment.contentType === 'message/delivery-status') {
        const dsn = attachment.content.toString();
        const result = parseDsn(dsn);
        if (result) results.push(result);
      }
    }
  }

  // Check for spam complaint (Feedback-ID / X-Mailer-Daemon)
  const subject = parsed.subject ?? '';
  if (
    subject.toLowerCase().includes('spam') ||
    subject.toLowerCase().includes('abuse') ||
    parsed.headers.has('feedback-id')
  ) {
    const fromEmail = parsed.from?.value[0]?.address;
    if (fromEmail) {
      results.push({ email: fromEmail, type: 'COMPLAINT', reason: 'spam_complaint' });
    }
  }

  return results;
}

function parseDsn(dsn: string): BounceResult | null {
  const emailMatch = dsn.match(/Final-Recipient:.*?;\s*(.+)/i);
  const statusMatch = dsn.match(/Status:\s*(\d\.\d+\.\d+)/i);

  if (!emailMatch) return null;

  const email = emailMatch[1].trim();
  const statusCode = statusMatch?.[1];
  const prefix = statusCode?.split('.')[0];

  if (!prefix) return null;

  if (HARD_BOUNCE_CODES.has(prefix + (statusCode?.slice(1, 3) ?? '')) || prefix === '5') {
    return { email, type: 'HARD', statusCode, reason: dsn };
  }

  if (SOFT_BOUNCE_CODES.has(prefix + (statusCode?.slice(1, 3) ?? '')) || prefix === '4') {
    return { email, type: 'SOFT', statusCode, reason: dsn };
  }

  return null;
}

export async function handleBounce(userId: string, bounce: BounceResult): Promise<void> {
  logger.info(`Bounce received: ${bounce.email} (${bounce.type})`);

  if (bounce.type === 'HARD') {
    await addSuppression(userId, bounce.email, 'hard_bounce', 'HARD');
  } else if (bounce.type === 'COMPLAINT') {
    await addSuppression(userId, bounce.email, 'spam_complaint');
  }

  // Record event on the most recent email to this address
  const email = await prisma.email.findFirst({
    where: { userId, toAddresses: { has: bounce.email } },
    orderBy: { createdAt: 'desc' },
  });

  if (email) {
    const eventType = bounce.type === 'COMPLAINT' ? 'SPAM_COMPLAINT' : 'BOUNCED';
    await prisma.emailEvent.create({
      data: { emailId: email.id, eventType: eventType as any, metadata: { bounceType: bounce.type } },
    });
    if (bounce.type === 'HARD') {
      await prisma.email.update({ where: { id: email.id }, data: { status: 'BOUNCED' } });
    }
  }
}
