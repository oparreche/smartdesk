import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';
import { logger } from './logger';

let _transport: Transporter | null = null;

function transport(): Transporter {
  if (_transport) return _transport;
  _transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: Boolean(env.SMTP_SECURE),
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });
  return _transport;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

/**
 * Envia email transacional via SMTP configurado.
 *
 * Em dev usa MailHog (http://localhost:8025 pra ver mensagens).
 * Em prod usa Resend/SES/Mailgun via SMTP — defina SMTP_HOST/PORT/USER/PASS.
 *
 * Não usado pra responder ticket (isso vai pelo Gmail conectado).
 */
export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  try {
    const info = await transport().sendMail({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
    });
    logger.info(
      { to: input.to, subject: input.subject, messageId: info.messageId },
      'email sent',
    );
    return { messageId: info.messageId ?? '' };
  } catch (err) {
    logger.error({ err, to: input.to, subject: input.subject }, 'email send failed');
    throw err;
  }
}

/**
 * Wrapper minimalista pra HTML simples — usa estrutura editorial.
 */
export function brandedEmail({
  preheader,
  title,
  body,
  cta,
}: {
  preheader?: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}): string {
  const safeBody = body.replace(/\n/g, '<br>');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#e8e5d8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#15171c">
${preheader ? `<div style="display:none;font-size:1px;color:#e8e5d8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8e5d8">
  <tr><td align="center" style="padding:40px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#faf8f1;border:1px solid #cfccbc;border-radius:6px;max-width:520px;width:100%">
      <tr><td style="padding:32px 32px 0">
        <p style="margin:0;font-family:Georgia,serif;font-size:24px;font-weight:600;letter-spacing:-0.5px;color:#15171c">SmartDesk</p>
        <h1 style="margin:24px 0 8px;font-family:Georgia,serif;font-size:28px;line-height:1.15;font-weight:600;letter-spacing:-0.5px;color:#15171c">${escapeHtml(title)}</h1>
      </td></tr>
      <tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#3a3d44">${safeBody}</td></tr>
      ${
        cta
          ? `<tr><td style="padding:0 32px 32px"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#1c2541;color:#f6f4ee;padding:11px 20px;border-radius:4px;font-size:14px;font-weight:500;text-decoration:none">${escapeHtml(cta.label)}</a></td></tr>`
          : ''
      }
      <tr><td style="border-top:1px solid #d8d4c4;padding:18px 32px;font-size:11px;color:#6a6c74">
        Enviado por SmartDesk — se você não esperava este email, ignore-o.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
