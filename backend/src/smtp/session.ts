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
  const fromAddress = session.envelope.mailFrom.address;
  const toAddresses = session.envelope.rcptTo.map((r) => r.address);
  const subject = parsed.subject ?? '(no subject)';

  // Ensure Message-ID header exists — Gmail rejects emails without one
  const generatedId = `${uuidv4()}@${fromAddress.split('@')[1]}`;
  const messageId = (parsed.messageId ?? generatedId).replace(/[<>]/g, '');
  let finalRaw = rawEmail;
  if (!parsed.messageId) {
    const header = `Message-ID: <${generatedId}>\r\n`;
    finalRaw = Buffer.concat([Buffer.from(header), rawEmail]);
  }

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
      size: finalRaw.length,
    },
  });

  await dispatchEmail({
    emailId: email.id,
    userId,
    rawEmail: finalRaw.toString('base64'),
    fromAddress,
    toAddresses,
    domainId: domainRecord?.id ?? null,
  });

  logger.info(`Email dispatched: ${email.id} from ${fromAddress} to ${toAddresses.join(', ')}`);
}
