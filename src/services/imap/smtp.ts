import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '@/src/lib/logger';

export type SmtpSecurity = 'ssl' | 'starttls' | 'none';

export type SmtpConfig = {
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string;
  password: string;
  fromName?: string | null;
  fromAddress: string;
};

const TIMEOUT_MS = 30_000;

function transporterFor(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === 'ssl',
    requireTLS: cfg.security === 'starttls',
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
}

export async function verifyTransport(cfg: SmtpConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const tx = transporterFor(cfg);
  try {
    await tx.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    tx.close();
  }
}

export type SendInput = {
  to: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  /** Headers extras (ex: X-SmartDesk-Ticket: HELP-100020) */
  extraHeaders?: Record<string, string>;
};

export type SendResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
};

export async function sendViaSmtp(cfg: SmtpConfig, input: SendInput): Promise<SendResult> {
  const tx = transporterFor(cfg);
  try {
    const result = await tx.sendMail({
      from: cfg.fromName ? `${cfg.fromName} <${cfg.fromAddress}>` : cfg.fromAddress,
      to: input.to,
      cc: input.cc ?? undefined,
      bcc: input.bcc ?? undefined,
      subject: input.subject,
      text: input.bodyText,
      html: input.bodyHtml ?? undefined,
      inReplyTo: input.inReplyTo ?? undefined,
      references: input.references ?? undefined,
      headers: input.extraHeaders,
    });

    logger.info(
      {
        smtpHost: cfg.host,
        from: cfg.fromAddress,
        to: input.to,
        subject: input.subject.slice(0, 80),
        messageId: result.messageId,
      },
      'smtp.send ok',
    );

    return {
      messageId: result.messageId,
      accepted: result.accepted.map(String),
      rejected: result.rejected.map(String),
    };
  } finally {
    tx.close();
  }
}
