import 'server-only';
import { promises as dnsPromises } from 'node:dns';
import { isIP } from 'node:net';
import { Agent as UndiciAgent, fetch as undiciFetch } from 'undici';
import { logger } from './logger';

type LookupAddress = { address: string; family: number };

/**
 * Cliente HTTP "seguro" para chamadas a APIs externas configuradas pelos clientes.
 *
 * Garante:
 *  - Apenas http/https.
 *  - DNS resolve manual: bloqueia IPs privados/loopback/link-local antes de conectar.
 *  - Redirects manuais e revalidados (impede DNS rebinding via 30x para IP interno).
 *  - Timeout + limite de tamanho de resposta.
 *  - Portas perigosas bloqueadas por padrão.
 *
 * Esta função é a UNICA forma de fazer chamadas HTTP a URLs definidas pela
 * organização contratante. NÃO use `fetch` ou `axios` direto para integrações
 * configuráveis — esses não têm SSRF guard.
 */

export type SafeFetchOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string | Buffer | null;
  timeoutMs?: number;
  /** Limite em bytes da resposta. Default 1MB, hard cap 5MB. */
  maxResponseBytes?: number;
  /** Máximo de redirects a seguir. Default 3, max 5. */
  maxRedirects?: number;
};

export type SafeFetchResponse = {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  bodyText: string;
  /** Truncado se passou de maxResponseBytes? */
  truncated: boolean;
  durationMs: number;
  finalUrl: string;
};

export class SsrfBlockedError extends Error {
  constructor(public reason: string, public detail?: string) {
    super(`Endereço bloqueado por SSRF guard: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'SsrfBlockedError';
  }
}

export class HttpClientError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'HttpClientError';
  }
}

const DEFAULT_MAX_BYTES = 1 * 1024 * 1024;
const HARD_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const HARD_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 3;
const HARD_MAX_REDIRECTS = 5;

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443, 8000, 3000, 5000, 8000]);

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResponse> {
  const t0 = Date.now();
  const maxBytes = Math.min(HARD_MAX_BYTES, opts.maxResponseBytes ?? DEFAULT_MAX_BYTES);
  const timeoutMs = Math.min(HARD_TIMEOUT_MS, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxRedirects = Math.min(HARD_MAX_REDIRECTS, opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS);

  let currentUrl = rawUrl;
  let redirectCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const target = await validateAndResolve(currentUrl);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    let res;
    try {
      res = await undiciFetch(currentUrl, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body ?? undefined,
        signal: ac.signal,
        redirect: 'manual',
        dispatcher: buildDispatcher(target.address),
      });
    } catch (err) {
      clearTimeout(timer);
      const e = err as Error & { cause?: { message?: string; code?: string } };
      const detail = e.cause?.message ? `${e.message}: ${e.cause.message}` : e.message;
      throw new HttpClientError(detail);
    }
    clearTimeout(timer);

    // Manual redirect handling — revalida o destino
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new HttpClientError(`Muitos redirects (>${maxRedirects})`);
        }
        currentUrl = new URL(loc, currentUrl).toString();
        continue;
      }
    }

    // Lê body com cap
    const { text, truncated } = await readBodyCapped(res.body as ReadableStream<Uint8Array> | null, maxBytes);

    const headersObj: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });

    return {
      status: res.status,
      ok: res.ok,
      headers: headersObj,
      bodyText: text,
      truncated,
      durationMs: Date.now() - t0,
      finalUrl: currentUrl,
    };
  }
}

type Target = {
  protocol: 'http:' | 'https:';
  hostname: string;
  port: number;
  address: LookupAddress;
};

async function validateAndResolve(rawUrl: string): Promise<Target> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError('url_invalid', rawUrl);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError('protocol_not_allowed', parsed.protocol);
  }

  const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'http:' ? 80 : 443);
  if (!ALLOWED_PORTS.has(port)) {
    throw new SsrfBlockedError('port_not_allowed', String(port));
  }

  const hostname = parsed.hostname;
  if (!hostname) throw new SsrfBlockedError('hostname_missing');

  // Bloquear casos estranhos: nomes muito longos, etc.
  if (hostname.length > 253) {
    throw new SsrfBlockedError('hostname_too_long');
  }
  // Bloquear shorthand IP suspeito (ex.: 0177.0.0.1, 2130706433)
  if (/^[0-9]+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) {
    throw new SsrfBlockedError('hostname_numeric_suspicious', hostname);
  }

  let addresses: LookupAddress[];
  if (isIP(hostname)) {
    addresses = [{ address: hostname, family: isIP(hostname) }];
  } else {
    try {
      addresses = await dnsPromises.lookup(hostname, { all: true });
    } catch (err) {
      throw new SsrfBlockedError('dns_resolution_failed', (err as Error).message);
    }
  }

  for (const a of addresses) {
    if (isBlockedAddress(a.address, a.family)) {
      logger.warn({ url: rawUrl, ip: a.address }, 'safeFetch blocked IP');
      throw new SsrfBlockedError('private_or_loopback_ip', `${hostname} → ${a.address}`);
    }
  }

  // Prefere IPv4 — IPv6 pode estar bloqueado/lento em algumas redes
  const primary = addresses.find((a) => a.family === 4) ?? addresses[0];
  return { protocol: parsed.protocol, hostname, port, address: primary };
}

function buildDispatcher(target: LookupAddress): UndiciAgent {
  return new UndiciAgent({
    connect: {
      lookup: (
        _hostname: string,
        opts: unknown,
        cb: (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void,
      ) => {
        const all = (opts as { all?: boolean } | undefined)?.all === true;
        if (all) {
          cb(null, [{ address: target.address, family: target.family }]);
        } else {
          cb(null, target.address, target.family);
        }
      },
    },
  });
}

async function readBodyCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!body) return { text: '', truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.byteLength > maxBytes) {
      const remain = maxBytes - received;
      if (remain > 0) chunks.push(value.subarray(0, remain));
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* ok */
      }
      break;
    }
    chunks.push(value);
    received += value.byteLength;
  }
  const merged = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { text: merged.toString('utf8'), truncated };
}

// ─── SSRF guard: faixas bloqueadas ────────────────────────────────────────

const BLOCKED_IPV4_CIDRS: Array<[bigint, bigint]> = [
  cidrToRange('0.0.0.0/8'),       // "this" network
  cidrToRange('10.0.0.0/8'),       // RFC 1918
  cidrToRange('100.64.0.0/10'),    // CGNAT
  cidrToRange('127.0.0.0/8'),      // loopback
  cidrToRange('169.254.0.0/16'),   // link-local + AWS/GCP metadata
  cidrToRange('172.16.0.0/12'),    // RFC 1918
  cidrToRange('192.0.0.0/24'),     // IETF protocol assignments
  cidrToRange('192.0.2.0/24'),     // TEST-NET
  cidrToRange('192.168.0.0/16'),   // RFC 1918
  cidrToRange('198.18.0.0/15'),    // benchmarking
  cidrToRange('198.51.100.0/24'),  // TEST-NET-2
  cidrToRange('203.0.113.0/24'),   // TEST-NET-3
  cidrToRange('224.0.0.0/4'),      // multicast
  cidrToRange('240.0.0.0/4'),      // reserved (incluindo broadcast 255.255.255.255)
];

export function isBlockedAddress(address: string, family: number): boolean {
  if (family === 4) {
    const ip = ipv4ToBigInt(address);
    if (ip === null) return true;
    for (const [start, end] of BLOCKED_IPV4_CIDRS) {
      if (ip >= start && ip <= end) return true;
    }
    return false;
  }
  if (family === 6) {
    const ip = address.toLowerCase();
    if (ip === '::1') return true;                                            // loopback v6
    if (ip === '::' || ip.startsWith('::ffff:')) {
      // IPv4-mapped: ::ffff:127.0.0.1 → cair pra check v4
      const tail = ip.replace('::ffff:', '');
      if (isIP(tail) === 4) return isBlockedAddress(tail, 4);
      return true;
    }
    if (ip.startsWith('fe80:')) return true;                                  // link-local
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true;              // unique local
    if (ip.startsWith('ff')) return true;                                     // multicast
    return false;
  }
  return true;
}

function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    out = (out << 8n) | BigInt(n);
  }
  return out;
}

function cidrToRange(cidr: string): [bigint, bigint] {
  const [base, bits] = cidr.split('/');
  const baseInt = ipv4ToBigInt(base);
  if (baseInt === null) throw new Error(`bad cidr: ${cidr}`);
  const prefix = Number(bits);
  const hostBits = 32 - prefix;
  const mask = ((1n << 32n) - 1n) ^ ((1n << BigInt(hostBits)) - 1n);
  const start = baseInt & mask;
  const end = start | ((1n << BigInt(hostBits)) - 1n);
  return [start, end];
}
