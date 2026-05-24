import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from '@/src/lib/prisma';
import { sendEmail, brandedEmail } from '@/src/lib/mailer';
import { env } from '@/src/lib/env';
import { checkRateLimit } from '@/src/lib/rate-limit';
import { audit } from '@/src/services/audit/log';
import {
  PORTAL_SESSION_COOKIE,
  decodeSession,
  encodeLoginToken,
  encodeSession,
  decodeLoginToken,
} from './token';

export type PortalSession = {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  requesterId: string;
  email: string;
  name: string | null;
};

export async function getPortalSession(): Promise<PortalSession | null> {
  const c = await cookies();
  const raw = c.get(PORTAL_SESSION_COOKIE)?.value;
  if (!raw) return null;
  const decoded = decodeSession(raw);
  if (!decoded) return null;

  const org = await prisma.organization.findFirst({
    where: { slug: decoded.organizationSlug, deletedAt: null },
    select: { id: true, slug: true, name: true },
  });
  if (!org) return null;

  const requester = await prisma.requester.findFirst({
    where: { id: decoded.requesterId, organizationId: org.id },
    select: { id: true, email: true, name: true },
  });
  if (!requester) return null;

  return {
    organizationId: org.id,
    organizationSlug: org.slug,
    organizationName: org.name,
    requesterId: requester.id,
    email: requester.email ?? decoded.email,
    name: requester.name,
  };
}

export async function setPortalSession(
  organizationSlug: string,
  requesterId: string,
  email: string,
): Promise<void> {
  const token = encodeSession(organizationSlug, requesterId, email);
  const c = await cookies();
  c.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function clearPortalSession(): Promise<void> {
  const c = await cookies();
  c.delete(PORTAL_SESSION_COOKIE);
}

/**
 * Pede magic link pro email informado. Envia sempre 200 mesmo se org/email não existir
 * (anti-enumeration). Rate limit por email+org pra prevenir spam.
 */
export async function requestMagicLink(input: {
  organizationSlug: string;
  email: string;
}): Promise<{ ok: true }> {
  const email = input.email.trim().toLowerCase();
  const slug = input.organizationSlug.trim().toLowerCase();

  const rl = await checkRateLimit({
    bucket: `portal:magic:${slug}:${email}`,
    max: 3,
    windowSeconds: 600,
  });
  if (!rl.allowed) return { ok: true };

  const org = await prisma.organization.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!org) return { ok: true };

  const requester = await prisma.requester.findFirst({
    where: { organizationId: org.id, email },
    select: { id: true },
  });
  if (!requester) return { ok: true };

  const token = encodeLoginToken(slug, email);
  const url = `${env.APP_URL}/portal/${slug}/login/${token}`;

  const html = brandedEmail({
    preheader: `Acesso ao portal — ${org.name}`,
    title: 'Acessar portal',
    body: `
      <p>Você pediu acesso ao portal de atendimento de <strong>${escapeHtml(org.name)}</strong>.</p>
      <p>Esse link expira em 30 minutos:</p>
    `,
    cta: { label: 'Entrar no portal', href: url },
  });

  await sendEmail({
    to: email,
    subject: `Acesso ao portal — ${org.name}`,
    html,
    text: `Acesse o portal: ${url}\n\nO link expira em 30 minutos.`,
  });

  await audit({
    organizationId: org.id,
    actorUserId: null,
    action: 'portal.magic_link_sent',
    resourceType: 'requester',
    resourceId: requester.id,
    diff: { after: { email } },
  });

  return { ok: true };
}

/**
 * Consome o magic link, cria a sessão e retorna o requester.
 */
export async function consumeMagicLink(token: string): Promise<{ ok: true; orgSlug: string } | { ok: false; reason: string }> {
  const payload = decodeLoginToken(token);
  if (!payload) return { ok: false, reason: 'invalid_or_expired' };

  const org = await prisma.organization.findFirst({
    where: { slug: payload.organizationSlug, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (!org) return { ok: false, reason: 'org_not_found' };

  const requester = await prisma.requester.findFirst({
    where: { organizationId: org.id, email: payload.email },
    select: { id: true, email: true },
  });
  if (!requester || !requester.email) return { ok: false, reason: 'requester_not_found' };

  await setPortalSession(org.slug, requester.id, requester.email);

  await audit({
    organizationId: org.id,
    actorUserId: null,
    action: 'portal.login',
    resourceType: 'requester',
    resourceId: requester.id,
    diff: { after: { email: requester.email } },
  });

  return { ok: true, orgSlug: org.slug };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
