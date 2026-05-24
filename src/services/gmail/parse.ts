import 'server-only';
import type { gmail_v1 } from 'googleapis';

export type ParsedHeaders = {
  subject: string | null;
  from: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  autoSubmitted: string | null;
  precedence: string | null;
  date: string | null;
};

export type ParsedEmail = {
  headers: ParsedHeaders;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: ParsedAttachment[];
};

export type ParsedAttachment = {
  filename: string;
  contentType: string;
  sizeBytes: number;
  attachmentId: string;
};

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const h = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

function decodeBody(data: string | null | undefined): string | null {
  if (!data) return null;
  try {
    return Buffer.from(data, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: { text?: string; html?: string; attachments: ParsedAttachment[] },
): void {
  if (!part) return;
  const mime = part.mimeType ?? '';
  const filename = part.filename ?? '';

  if (filename && part.body?.attachmentId) {
    out.attachments.push({
      filename,
      contentType: mime || 'application/octet-stream',
      sizeBytes: Number(part.body.size ?? 0),
      attachmentId: part.body.attachmentId,
    });
    return;
  }

  if (mime === 'text/plain' && !out.text) {
    out.text = decodeBody(part.body?.data) ?? undefined;
  } else if (mime === 'text/html' && !out.html) {
    out.html = decodeBody(part.body?.data) ?? undefined;
  }

  if (part.parts?.length) {
    for (const p of part.parts) walkParts(p, out);
  }
}

export function parseMessage(msg: gmail_v1.Schema$Message): ParsedEmail {
  const payload = msg.payload;
  const headers = payload?.headers ?? [];

  const out: { text?: string; html?: string; attachments: ParsedAttachment[] } = { attachments: [] };

  if (payload) {
    // Se a mensagem é single-part (sem subparts), o body está em payload.body
    if (!payload.parts?.length) {
      const mime = payload.mimeType ?? '';
      if (mime === 'text/plain') out.text = decodeBody(payload.body?.data) ?? undefined;
      else if (mime === 'text/html') out.html = decodeBody(payload.body?.data) ?? undefined;
    } else {
      walkParts(payload, out);
    }
  }

  return {
    headers: {
      subject: headerValue(headers, 'Subject'),
      from: headerValue(headers, 'From'),
      to: headerValue(headers, 'To'),
      cc: headerValue(headers, 'Cc'),
      bcc: headerValue(headers, 'Bcc'),
      messageId: headerValue(headers, 'Message-ID') ?? headerValue(headers, 'Message-Id'),
      inReplyTo: headerValue(headers, 'In-Reply-To'),
      references: headerValue(headers, 'References'),
      autoSubmitted: headerValue(headers, 'Auto-Submitted'),
      precedence: headerValue(headers, 'Precedence'),
      date: headerValue(headers, 'Date'),
    },
    bodyText: out.text ?? null,
    bodyHtml: out.html ?? null,
    attachments: out.attachments,
  };
}

const EMAIL_ADDRESS_RE = /([^\s<]+@[^\s>]+)/;
const TICKET_CODE_RE = /\[HELP-(\d+)\]/i;

export function extractEmailAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(EMAIL_ADDRESS_RE);
  return m ? m[1].toLowerCase() : null;
}

export function extractDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^\s*(?:"?([^"<]+?)"?)\s*<[^>]+>/);
  if (m) return m[1].trim();
  return null;
}

export function extractTicketCode(subject: string | null | undefined): string | null {
  if (!subject) return null;
  const m = subject.match(TICKET_CODE_RE);
  return m ? `HELP-${m[1]}` : null;
}

export function looksAutoSubmitted(headers: ParsedHeaders): boolean {
  const auto = headers.autoSubmitted?.toLowerCase() ?? '';
  if (auto && auto !== 'no') return true;
  const prec = headers.precedence?.toLowerCase() ?? '';
  if (['bulk', 'auto_reply', 'junk', 'list'].includes(prec)) return true;
  return false;
}

export function normalizeReferences(refs: string | null | undefined): string[] {
  if (!refs) return [];
  return refs
    .split(/\s+/)
    .map((r) => r.trim())
    .filter(Boolean);
}
