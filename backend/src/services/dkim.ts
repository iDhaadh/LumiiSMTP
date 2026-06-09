import crypto from 'crypto';
import { prisma } from '../db/client';
import { logger } from '../db/logger';

interface DkimKeys {
  privateKey: string;
  publicKey: string;
  dnsRecord: string;
  selector: string;
}

export async function generateDkimKeys(domainId: string): Promise<DkimKeys> {
  const selector = process.env.DKIM_SELECTOR ?? 'mail';

  // Use Node's crypto (not node-forge): PKCS#8 private keys are what mailauth's
  // dkimSign expects. node-forge emitted PKCS#1 keys, which silently produced an
  // empty signature and corrupted the message header block.
  const { publicKey: publicKeyPem, privateKey: privateKeyPem } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Strip PEM headers for DNS TXT record
  const publicKeyDns = publicKeyPem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');

  const domain = await prisma.domain.update({
    where: { id: domainId },
    data: {
      dkimPrivateKey: privateKeyPem,
      dkimPublicKey: publicKeyPem,
      dkimSelector: selector,
    },
  });

  const dnsRecord = `v=DKIM1; k=rsa; p=${publicKeyDns}`;

  logger.info(`Generated DKIM keys for domain ${domain.domain}`);

  return { privateKey: privateKeyPem, publicKey: publicKeyPem, dnsRecord, selector };
}

export async function signEmailWithDkim(
  rawEmail: Buffer,
  domainId: string
): Promise<Buffer> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain?.dkimPrivateKey) return rawEmail;

  try {
    const { dkimSign } = await import('mailauth');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // mailauth's dkimSign expects `signatureData` (NOT `keys`), and each entry
    // uses `signingDomain` for the d= tag. Passing `keys`/`domain` is silently
    // ignored — signatureData defaults to [], producing an empty signature with
    // no error, which is exactly the "len=2" bug we saw.
    const result: any = await dkimSign(rawEmail, {
      canonicalization: 'relaxed/relaxed',
      algorithm: 'rsa-sha256',
      signTime: new Date(),
      signatureData: [
        {
          signingDomain: domain.domain,
          selector: domain.dkimSelector,
          privateKey: domain.dkimPrivateKey,
        },
      ],
    } as any);

    // mailauth may return a string or an object with a `signatures` field.
    const sigRaw: string =
      typeof result === 'string' ? result : (result?.signatures ?? '');

    // CRITICAL: only prepend when we actually have a DKIM-Signature header.
    // A blank/whitespace-only result would prepend a leading CRLF, which
    // empties the header block and makes mail clients treat all real headers
    // (From/To/Subject/Content-Type) as the message body.
    if (/DKIM-Signature\s*:/i.test(sigRaw)) {
      // Normalise: strip any trailing newlines, then add exactly one CRLF so
      // the signature header joins cleanly with the existing header block.
      const sig = sigRaw.replace(/[\r\n]+$/, '');
      return Buffer.concat([Buffer.from(sig + '\r\n', 'utf8'), rawEmail]);
    }

    logger.warn(
      `DKIM produced no valid signature for ${domain.domain}; sending unsigned`
    );
  } catch (err) {
    logger.warn(`DKIM signing failed for domain ${domain.domain}: ${(err as Error).message}`);
  }

  // Always return a structurally-intact message, signed or not.
  return rawEmail;
}

export async function verifyDomainDns(domainId: string): Promise<{
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
}> {
  const dns = await import('dns/promises');
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) throw new Error('Domain not found');

  const results = { spf: false, dkim: false, dmarc: false };

  try {
    const txtRecords = await dns.resolveTxt(domain.domain);
    results.spf = txtRecords.flat().some((r) => r.startsWith('v=spf1'));
  } catch { /* no SPF */ }

  try {
    const dkimRecords = await dns.resolveTxt(
      `${domain.dkimSelector}._domainkey.${domain.domain}`
    );
    results.dkim = dkimRecords.flat().some((r) => r.includes('v=DKIM1'));
  } catch { /* no DKIM */ }

  try {
    const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain.domain}`);
    results.dmarc = dmarcRecords.flat().some((r) => r.startsWith('v=DMARC1'));
  } catch { /* no DMARC */ }

  await prisma.domain.update({
    where: { id: domainId },
    data: {
      spfVerified: results.spf,
      dkimVerified: results.dkim,
      dmarcVerified: results.dmarc,
      isVerified: results.spf && results.dkim,
    },
  });

  return results;
}
