import 'server-only';
import { Buffer } from 'node:buffer';
import { type AuthType } from '@prisma/client';
import { encryptJson, decryptJson, maskLast4 } from '@/src/lib/crypto';

export type AuthConfigNone = { type: 'none' };
export type AuthConfigApiKeyHeader = { type: 'api_key_header'; headerName: string; value: string };
export type AuthConfigApiKeyQuery = { type: 'api_key_query'; paramName: string; value: string };
export type AuthConfigBearer = { type: 'bearer'; token: string };
export type AuthConfigBasic = { type: 'basic'; username: string; password: string };
export type AuthConfigCustomHeaders = { type: 'custom_headers'; headers: Record<string, string> };

export type AuthConfig =
  | AuthConfigNone
  | AuthConfigApiKeyHeader
  | AuthConfigApiKeyQuery
  | AuthConfigBearer
  | AuthConfigBasic
  | AuthConfigCustomHeaders;

export type SealedAuth = { ciphertext: string; nonce: string } | null;

export function sealAuth(config: AuthConfig): SealedAuth {
  if (!config || config.type === 'none') return null;
  return encryptJson(config);
}

export function unsealAuth(
  sealed: { ciphertext: string | null; nonce: string | null },
  authType: AuthType,
): AuthConfig {
  if (authType === 'none' || !sealed.ciphertext || !sealed.nonce) {
    return { type: 'none' };
  }
  return decryptJson<AuthConfig>({ ciphertext: sealed.ciphertext, nonce: sealed.nonce });
}

/**
 * Aplica auth config nos headers/queryParams compilados de uma requisição.
 * Lê só o que precisa — não vaza outras chaves.
 */
export function applyAuth(
  auth: AuthConfig,
  headers: Record<string, string>,
  queryParams: Record<string, string>,
): void {
  switch (auth.type) {
    case 'none':
      return;
    case 'api_key_header':
      headers[auth.headerName] = auth.value;
      return;
    case 'api_key_query':
      queryParams[auth.paramName] = auth.value;
      return;
    case 'bearer':
      headers['Authorization'] = `Bearer ${auth.token}`;
      return;
    case 'basic': {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`, 'utf8').toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
      return;
    }
    case 'custom_headers':
      for (const [k, v] of Object.entries(auth.headers)) {
        headers[k] = v;
      }
      return;
  }
}

/**
 * Resumo seguro do auth config para exibir na UI (sem revelar segredo).
 */
export type AuthSummary =
  | { type: 'none' }
  | { type: 'api_key_header'; headerName: string; valueLast4: string }
  | { type: 'api_key_query'; paramName: string; valueLast4: string }
  | { type: 'bearer'; tokenLast4: string }
  | { type: 'basic'; username: string; passwordLast4: string }
  | { type: 'custom_headers'; headerCount: number };

export function summarizeAuth(auth: AuthConfig): AuthSummary {
  switch (auth.type) {
    case 'none': return { type: 'none' };
    case 'api_key_header':
      return { type: 'api_key_header', headerName: auth.headerName, valueLast4: maskLast4(auth.value) };
    case 'api_key_query':
      return { type: 'api_key_query', paramName: auth.paramName, valueLast4: maskLast4(auth.value) };
    case 'bearer':
      return { type: 'bearer', tokenLast4: maskLast4(auth.token) };
    case 'basic':
      return { type: 'basic', username: auth.username, passwordLast4: maskLast4(auth.password) };
    case 'custom_headers':
      return { type: 'custom_headers', headerCount: Object.keys(auth.headers).length };
  }
}

/**
 * Mascara headers antes de salvar em ApiIntegrationRun (auditoria).
 */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'x-auth-token',
  'cookie',
  'proxy-authorization',
]);

export function maskHeadersForLog(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '***' : v;
  }
  return out;
}
