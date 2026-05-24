import 'server-only';
import bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/src/lib/prisma';
import { env } from '@/src/lib/env';
import { sendEmail, brandedEmail } from '@/src/lib/mailer';
import { audit } from '@/src/services/audit/log';
import { logger } from '@/src/lib/logger';

const TTL_MS = 60 * 60 * 1000; // 1h

type Payload = {
  userId: string;
  emailLower: string;
  /** Snapshot do hash atual da senha — invalida o token se a senha mudar */
  pwdSig: string;
  nonce: string;
  expiresAt: number;
};

function hmac(text: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(text).digest('base64url');
}

function passwordSignature(passwordHash: string | null): string {
  // Pega 16 chars do bcrypt hash. Se senha mudar, esse valor muda → token invalida.
  return hmac(`pwd:${passwordHash ?? 'none'}`).slice(0, 16);
}

export function encodeResetToken(payload: Omit<Payload, 'nonce' | 'expiresAt'>): string {
  const full: Payload = {
    ...payload,
    nonce: Math.random().toString(36).slice(2),
    expiresAt: Date.now() + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function decodeResetToken(token: string): Payload | null {
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

/**
 * Solicita reset. SEMPRE retorna sucesso (mesmo se email não existe) pra não
 * vazar quais emails estão cadastrados. Email só é enviado se o usuário existe.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    logger.info({ email }, 'password reset requested for non-existent user — silently ignored');
    return;
  }

  const token = encodeResetToken({
    userId: user.id,
    emailLower: email,
    pwdSig: passwordSignature(user.passwordHash),
  });
  const url = `${env.APP_URL}/reset-password/${token}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Recuperação de senha — SmartDesk',
      text: `Olá ${user.name},\n\nClique no link a seguir para redefinir sua senha:\n${url}\n\nO link expira em 1 hora. Se você não pediu isso, ignore este email.\n\n— SmartDesk`,
      html: brandedEmail({
        preheader: 'Link de recuperação dentro',
        title: 'Recuperar acesso',
        body: `Olá ${user.name},\n\nUse o botão abaixo para definir uma nova senha. O link expira em 1 hora.\n\nSe você não pediu isso, ignore.`,
        cta: { label: 'Redefinir senha', href: url },
      }),
    });
  } catch (err) {
    logger.error({ err, email }, 'failed to send password reset email');
  }

  await audit({
    organizationId: null,
    actorUserId: user.id,
    action: 'auth.password_reset.requested',
    resourceType: 'user',
    resourceId: user.id,
  });
}

export class PasswordResetError extends Error {
  constructor(public code: 'invalid_token' | 'token_expired' | 'weak_password' | 'user_not_found') {
    super(code);
    this.name = 'PasswordResetError';
  }
}

export async function consumeResetToken(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new PasswordResetError('weak_password');

  const payload = decodeResetToken(token);
  if (!payload) throw new PasswordResetError('invalid_token');

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, passwordHash: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new PasswordResetError('user_not_found');

  // Token vinculado ao hash de senha — se a senha já mudou, token vira inválido (one-time-use-ish)
  if (passwordSignature(user.passwordHash) !== payload.pwdSig) {
    throw new PasswordResetError('invalid_token');
  }
  if (user.email.toLowerCase() !== payload.emailLower) {
    throw new PasswordResetError('invalid_token');
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  await audit({
    organizationId: null,
    actorUserId: user.id,
    action: 'auth.password_reset.completed',
    resourceType: 'user',
    resourceId: user.id,
  });
}
