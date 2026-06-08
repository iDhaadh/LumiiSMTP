import forge from 'node-forge';
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

  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
  const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);

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
    const { signatures } = await dkimSign(rawEmail, {
      canonicalization: 'relaxed/relaxed',
      algorithm: 'rsa-sha256',
      signTime: new Date(),
      keys: [
        {
          privateKey: domain.dkimPrivateKey,
          selector: domain.dkimSelector,
          domain: domain.domain,
        },
      ],
    } as any);

    if (signatures) {
      return Buffer.concat([Buffer.from(signatures), rawEmail]);
    }
  } catch (err) {
    logger.warn(`DKIM signing failed for domain ${domain.domain}: ${(err as Error).message}`);
  }

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
