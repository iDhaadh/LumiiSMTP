import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { simpleParser } from 'mailparser';
import { prisma } from '../db/client';
import { dispatchEmail } from '../queue/dispatcher';
import { logger } from '../db/logger';

export async function handleEmailData(
  userId: string,
  stream: Readable,
  session: { envelope: { mailFrom: { address: string }; rcptTo: { address: string }[] } }
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rawEmail = Buffer.concat(chunks);

  const parsed = await simpleParser(rawEmail);
  const messageId = (parsed.messageId ?? uuidv4()).replace(/[<>]/g, '');
  const fromAddress = session.envelope.mailFrom.address;
  const toAddresses = session.envelope.rcptTo.map((r) => r.address);
  const subject = parsed.subject ?? '(no subject)';

  const domain = fromAddress.split('@')[1];
  const domainRecord = await prisma.domain.findFirst({
    where: { userId, domain, isVerified: true },
  });

  const email = await prisma.email.create({
    data: {
      id: uuidv4(),
      userId,
      domainId: domainRecord?.id ?? null,
      messageId,
      fromAddress,
      toAddresses,
      subject,
      status: 'QUEUED',
      size: rawEmail.length,
    },
  });

  await dispatchEmail({
    emailId: email.id,
    userId,
    rawEmail: rawEmail.toString('base64'),
    fromAddress,
    toAddresses,
    domainId: domainRecord?.id ?? null,
  });

  logger.info(`Email dispatched: ${email.id} from ${fromAddress} to ${toAddresses.join(', ')}`);
}
