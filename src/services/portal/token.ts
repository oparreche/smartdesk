import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/src/lib/env';

const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export type LoginTokenPayload = {
  organizationSlug: string;
  email: string;
  exp: number;
};

export type SessionPayload = {
  organizationSlug: string;
  requesterId: string;
  email: string;
  exp: number;
};

function hmac(payload: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
}

function encodePayload<T>(payload: T): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body)}`;
}

function decodePayload<T>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = hmac(body);
  try {
    if (
      !timingSafeEqual(
        Buffer.from(sig, 'base64url'),
        Buffer.from(expected, 'base64url'),
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & {
      exp?: number;
    };
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export function encodeLoginToken(organizationSlug: string, email: string): string {
  return encodePayload<LoginTokenPayload>({
    organizationSlug,
    email: email.toLowerCase(),
    exp: Date.now() + LOGIN_TOKEN_TTL_MS,
  });
}

export function decodeLoginToken(token: string): LoginTokenPayload | null {
  return decodePayload<LoginTokenPayload>(token);
}

export function encodeSession(
  organizationSlug: string,
  requesterId: string,
  email: string,
): string {
  return encodePayload<SessionPayload>({
    organizationSlug,
    requesterId,
    email: email.toLowerCase(),
    exp: Date.now() + SESSION_TTL_MS,
  });
}

export function decodeSession(token: string): SessionPayload | null {
  return decodePayload<SessionPayload>(token);
}

export const PORTAL_SESSION_COOKIE = 'sd_portal_session';
