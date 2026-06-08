import * as cheerio from 'cheerio';
import { simpleParser } from 'mailparser';

export async function injectTracking(
  rawEmail: Buffer,
  emailId: string,
  trackingDomain: string
): Promise<Buffer> {
  const parsed = await simpleParser(rawEmail);
  if (!parsed.html) return rawEmail;

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

  // Inject open tracking pixel before </body>
  const pixel = `<img src="https://${trackingDomain}/t/open/${emailId}" width="1" height="1" style="display:none" alt="" />`;
  $('body').append(pixel);

  const modifiedHtml = $.html();

  // Rebuild the raw email with the modified HTML
  const lines = rawEmail.toString('utf8').split('\r\n');
  const headerEnd = lines.findIndex((l) => l === '');
  const headers = lines.slice(0, headerEnd + 1).join('\r\n');

  // Simple rebuild: replace content-type text/html body
  // For production, use a proper MIME library
  const newBody = modifiedHtml;
  const rebuilt = `${headers}\r\n${newBody}`;

  return Buffer.from(rebuilt, 'utf8');
}
