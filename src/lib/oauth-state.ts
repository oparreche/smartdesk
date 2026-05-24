import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';

/**
 * State assinado para OAuth: carrega organizationId + userId + nonce,
 * com HMAC para impedir falsificação.
 */
export type StatePayload = {
  organizationId: string;
  userId: string;
  nonce: string;
  expiresAt: number;
};

const STATE_TTL_MS = 10 * 60 * 1000;

function hmac(payload: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
}

export function encodeState(input: { organizationId: string; userId: string }): string {
  const payload: StatePayload = {
    organizationId: input.organizationId,
    userId: input.userId,
    nonce: Math.random().toString(36).slice(2),
    expiresAt: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export function decodeState(state: string): StatePayload | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = hmac(body);
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
