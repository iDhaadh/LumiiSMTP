import * as cheerio from 'cheerio';
import { simpleParser } from 'mailparser';

export async function injectTracking(
  rawEmail: Buffer,
  emailId: string,
  trackingDomain: string
): Promise<Buffer> {
  const parsed = await simpleParser(rawEmail);
  if (!parsed.html) return rawEmail;

  // ── Guard: skip multipart emails entirely ─────────────────────────────────
  // Rebuilding multipart MIME through MailComposer + nodemailer raw causes the
  // whole message to be wrapped as the body of an outer envelope message,
  // breaking subject, attachments and formatting in mail clients.
  // For any email that carries attachments or has a multipart Content-Type we
  // return the original bytes untouched.
  if ((parsed.attachments ?? []).length > 0) return rawEmail;

  const rawStr = rawEmail.toString('utf8');
  if (/^content-type:\s*multipart\//im.test(rawStr)) return rawEmail;

  // ── Inject tracking into simple (single-part) HTML emails ─────────────────
  const $ = cheerio.load(parsed.html);

  // Rewrite links for click tracking
  $('a[href]').each((_i, el) => {
    const original = $(el).attr('href') ?? '';
    if (!original.startsWith('http')) return;
    const encoded = encodeURIComponent(original);
    $(el).attr(
      'href',
      `https://${trackingDomain}/t/click/${emailId}?url=${encoded}`
    );
  });

  // Inject open-tracking pixel before </body>
  const pixel = `<img src="https://${trackingDomain}/t/open/${emailId}" width="1" height="1" style="display:none" alt="" />`;
  $('body').append(pixel);

  const modifiedHtml = $.html();

  // Splice modified HTML body back into the raw message, preserving all
  // original headers verbatim (no MIME rebuild, no nodemailer wrapping risk).
  const sep = rawStr.indexOf('\r\n\r\n');
  if (sep === -1) return rawEmail; // malformed – bail out safely

  const headers = rawStr.slice(0, sep + 4); // headers + blank line
  return Buffer.from(headers + modifiedHtml, 'utf8');
}
