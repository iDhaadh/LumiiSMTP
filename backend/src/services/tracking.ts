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

  // Rebuild email preserving full MIME structure (attachments, multipart, etc.)
  // using nodemailer MailComposer so we don't corrupt boundaries
  try {
    const { default: MailComposer } = await import('nodemailer/lib/mail-composer');

    const skipHeaders = new Set([
      'from','to','cc','bcc','subject','content-type','mime-version',
      'message-id','date','reply-to','content-transfer-encoding',
    ]);
    const extraHeaders: Record<string, string> = {};
    parsed.headers?.forEach((value, key) => {
      if (!skipHeaders.has(key.toLowerCase())) {
        extraHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value);
      }
    });

    const attachments = (parsed.attachments ?? []).map((att) => ({
      filename: att.filename ?? 'attachment',
      content: att.content,
      contentType: att.contentType,
      contentDisposition: att.contentDisposition as 'attachment' | 'inline',
      cid: att.cid,
    }));

    const composer = new MailComposer({
      from: parsed.from?.text,
      to: parsed.to?.text,
      cc: parsed.cc?.text,
      subject: parsed.subject,
      html: modifiedHtml,
      text: parsed.text ?? undefined,
      attachments,
      headers: extraHeaders,
      date: parsed.date,
      messageId: parsed.messageId ?? undefined,
    } as any);

    return new Promise<Buffer>((resolve, reject) => {
      composer.compile().build((err, message) => {
        if (err) reject(err);
        else resolve(message);
      });
    });
  } catch {
    // Fallback: return original if rebuild fails
    return rawEmail;
  }
}
