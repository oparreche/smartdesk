import 'server-only';
import { ImapFlow, type FetchMessageObject } from 'imapflow';
import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import { logger } from '@/src/lib/logger';

export type ImapSecurity = 'ssl' | 'starttls' | 'none';

export type ImapConfig = {
  host: string;
  port: number;
  security: ImapSecurity;
  user: string;
  password: string;
  folder?: string;
};

export type ImapFetchOptions = {
  /** Maior UID já ingestado nesta combinação host+user+folder. Busca tudo > este. */
  sinceUid?: number;
  /** UIDVALIDITY conhecido — se mudar, ignora sinceUid (mailbox foi recriada). */
  knownUidValidity?: bigint | null;
  /** Limite de mensagens por execução. */
  maxMessages?: number;
};

export type ImapFetchResult = {
  uidValidity: bigint;
  messages: ImapMessage[];
};

export type ImapMessage = {
  uid: number;
  flags: string[];
  internalDate: Date;
  parsed: ParsedMail;
  rawSize: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

export function imapClientFor(cfg: ImapConfig): ImapFlow {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === 'ssl',
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
    socketTimeout: DEFAULT_TIMEOUT_MS,
    greetingTimeout: DEFAULT_TIMEOUT_MS,
    tls: cfg.security === 'none' ? undefined : { rejectUnauthorized: true },
    // STARTTLS: imapflow ativa automaticamente quando secure=false e servidor suporta
  });
}

/**
 * Conecta, valida credencial e retorna ack. Útil pro "Testar conexão" da UI.
 */
export async function testConnection(cfg: ImapConfig): Promise<{
  ok: true;
  serverInfo: { name: string; vendor?: string };
  mailboxes: number;
} | { ok: false; error: string }> {
  const client = imapClientFor(cfg);
  try {
    await client.connect();
    const serverInfo = {
      name: client.serverInfo?.name ?? 'unknown',
      vendor: client.serverInfo?.vendor,
    };
    const list = await client.list();
    return { ok: true, serverInfo, mailboxes: list.length };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    try {
      await client.logout();
    } catch {
      /* noop */
    }
  }
}

/**
 * Busca mensagens novas (UID > sinceUid). Retorna parsed + UIDVALIDITY atual.
 * Se UIDVALIDITY mudou, ignora sinceUid e busca as últimas N mensagens.
 */
export async function fetchNewMessages(
  cfg: ImapConfig,
  opts: ImapFetchOptions = {},
): Promise<ImapFetchResult> {
  const folder = cfg.folder ?? 'INBOX';
  const client = imapClientFor(cfg);
  const maxMessages = Math.min(opts.maxMessages ?? 50, 200);

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(folder, { readOnly: true });
    const uidValidity = BigInt(mailbox.uidValidity);
    const sinceUid =
      opts.knownUidValidity != null && opts.knownUidValidity === uidValidity
        ? (opts.sinceUid ?? 0)
        : 0;

    // Calcula range UID — sinceUid+1:* (se sinceUid=0, vai pegar tudo, vamos limitar)
    const range = sinceUid > 0 ? `${sinceUid + 1}:*` : `1:*`;

    const messages: ImapMessage[] = [];
    const collected: FetchMessageObject[] = [];
    for await (const msg of client.fetch(
      range,
      { uid: true, flags: true, source: true, internalDate: true, envelope: true },
      { uid: true },
    )) {
      collected.push(msg as FetchMessageObject);
    }

    // Se primeira sincronia (sinceUid=0), pega só as últimas N — evita ingerir
    // anos de histórico de uma vez
    const sliced = sinceUid > 0 ? collected : collected.slice(-maxMessages);

    for (const msg of sliced) {
      if (!msg.source) continue;
      const parsed = await simpleParser(msg.source);
      messages.push({
        uid: Number(msg.uid),
        flags: Array.from(msg.flags ?? []),
        internalDate: msg.internalDate
          ? new Date(msg.internalDate as unknown as string | number | Date)
          : new Date(),
        parsed,
        rawSize: msg.source.length,
      });
    }

    return { uidValidity, messages };
  } catch (err) {
    logger.error({ err, host: cfg.host, user: cfg.user, folder }, 'imap.fetch failed');
    throw err;
  } finally {
    try {
      await client.logout();
    } catch {
      /* noop */
    }
  }
}

export function firstAddressEmail(addr: AddressObject | AddressObject[] | undefined): string | null {
  if (!addr) return null;
  const a = Array.isArray(addr) ? addr[0] : addr;
  const first = a?.value?.[0];
  return first?.address?.trim().toLowerCase() ?? null;
}

export function joinAddresses(addr: AddressObject | AddressObject[] | undefined): string | null {
  if (!addr) return null;
  const list = Array.isArray(addr) ? addr : [addr];
  const emails = list.flatMap((a) => a.value).map((v) => v.address).filter(Boolean);
  return emails.length > 0 ? emails.join(', ') : null;
}
