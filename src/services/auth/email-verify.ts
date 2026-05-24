import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/src/lib/prisma';
import { env } from '@/src/lib/env';
import { sendEmail, brandedEmail } from '@/src/lib/mailer';
import { audit } from '@/src/services/audit/log';
import { logger } from '@/src/lib/logger';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

type Payload = {
  userId: string;
  emailLower: string;
  nonce: string;
  expiresAt: number;
};

function hmac(text: string): string {
  return createHmac('sha256', env.AUTH_SECRET + ':verify').update(text).digest('base64url');
}

export function encodeVerifyToken(payload: Omit<Payload, 'nonce' | 'expiresAt'>): string {
  const full: Payload = {
    ...payload,
    nonce: Math.random().toString(36).slice(2),
    expiresAt: Date.now() + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function decodeVerifyToken(token: string): Payload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = hmac(body);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function sendVerificationEmail(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, emailVerifiedAt: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return;
  if (user.emailVerifiedAt) return;

  const token = encodeVerifyToken({ userId: user.id, emailLower: user.email.toLowerCase() });
  const url = `${env.APP_URL}/verify-email/${token}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Confirme seu email — SmartDesk',
      text: `Olá ${user.name},\n\nClique no link a seguir para confirmar seu email:\n${url}\n\nO link expira em 7 dias.\n\n— SmartDesk`,
      html: brandedEmail({
        preheader: 'Confirme seu email pra liberar o acesso completo',
        title: 'Confirme seu email',
        body: `Olá ${user.name},\n\nClique no botão abaixo para confirmar este endereço como seu. O link vale por 7 dias.`,
        cta: { label: 'Confirmar email', href: url },
      }),
    });
  } catch (err) {
    logger.error({ err, userId }, 'failed to send verification email');
  }
}

export class VerifyError extends Error {
  constructor(public code: 'invalid_token' | 'token_expired' | 'user_not_found' | 'email_mismatch' | 'already_verified') {
    super(code);
    this.name = 'VerifyError';
  }
}

export async function consumeVerifyToken(token: string): Promise<{ userId: string }> {
  const payload = decodeVerifyToken(token);
  if (!payload) throw new VerifyError('invalid_token');

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, emailVerifiedAt: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new VerifyError('user_not_found');
  if (user.email.toLowerCase() !== payload.emailLower) throw new VerifyError('email_mismatch');
  if (user.emailVerifiedAt) {
    return { userId: user.id };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  await audit({
    organizationId: null,
    actorUserId: user.id,
    action: 'auth.email.verified',
    resourceType: 'user',
    resourceId: user.id,
  });

  return { userId: user.id };
}
