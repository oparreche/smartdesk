import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

const KEY = Buffer.from(env.ENCRYPTION_KEY_BASE64, 'base64');

if (KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes');
}

export type Sealed = { ciphertext: string; nonce: string };

export function encrypt(plain: string): Sealed {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, KEY, nonce);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([enc, tag]).toString('base64'),
    nonce: nonce.toString('base64'),
  };
}

export function decrypt(sealed: Sealed): string {
  const nonce = Buffer.from(sealed.nonce, 'base64');
  const combined = Buffer.from(sealed.ciphertext, 'base64');
  if (combined.length < TAG_BYTES) {
    throw new Error('ciphertext too short');
  }
  const enc = combined.subarray(0, combined.length - TAG_BYTES);
  const tag = combined.subarray(combined.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, KEY, nonce);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

export function encryptJson(value: unknown): Sealed {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T = unknown>(sealed: Sealed): T {
  return JSON.parse(decrypt(sealed)) as T;
}

export function maskLast4(value: string): string {
  if (!value) return '';
  return value.length <= 4 ? '****' : `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;
}
