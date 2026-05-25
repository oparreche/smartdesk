import 'server-only';

/**
 * Faz fetch de uma URL e extrai texto principal.
 * Strip de tags HTML básico — sem dependência de parser. Suficiente pra docs.
 */
export async function fetchUrlAsText(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; SmartDeskCopilot/1.0; +https://github.com/oparreche/smartdesk)',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  const raw = await res.text();

  // Se for text/plain ou markdown, retorna direto
  if (contentType.startsWith('text/plain') || contentType.includes('markdown')) {
    return { title: deriveTitleFromUrl(url), text: raw.slice(0, 1_000_000) };
  }

  // HTML: strip tags
  const title = extractTitle(raw) ?? deriveTitleFromUrl(url);
  const text = htmlToText(raw).slice(0, 1_000_000);
  if (!text || text.length < 20) {
    throw new Error(`Não consegui extrair texto útil de ${url}`);
  }
  return { title, text };
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return m[1]!.replace(/\s+/g, ' ').trim().slice(0, 200) || null;
}

function deriveTitleFromUrl(u: string): string {
  try {
    const url = new URL(u);
    const path = url.pathname.replace(/\/$/, '');
    return path ? `${url.hostname}${path}` : url.hostname;
  } catch {
    return u;
  }
}

/**
 * Strip de tags + decode de entities + whitespace collapse.
 * Não é parser completo, mas suficiente pra retirar boilerplate básico.
 */
export function htmlToText(html: string): string {
  let s = html;
  // Remove blocos não-conteúdo
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  s = s.replace(/<header[\s\S]*?<\/header>/gi, ' ');
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  s = s.replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  // Inline block transitions
  s = s.replace(/<\/(p|div|li|h[1-6]|br|tr|td|th|section|article|blockquote)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // Strip tags
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode common entities
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/&#\d+;/g, ' ');
  // Collapse whitespace
  s = s.replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

import { createHash } from 'node:crypto';

export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Extrai texto de um arquivo baseado em filename + mimeType.
 * Suporta: pdf, docx, md, txt.
 */
export async function extractFromBuffer(
  buf: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const lower = filename.toLowerCase();
  const isPdf = mimeType.includes('pdf') || lower.endsWith('.pdf');
  const isDocx =
    mimeType.includes('officedocument.wordprocessingml') || lower.endsWith('.docx');
  const isMd = lower.endsWith('.md') || lower.endsWith('.markdown') || mimeType.includes('markdown');
  const isTxt = mimeType.startsWith('text/') || lower.endsWith('.txt');

  if (isPdf) {
    // dynamic import — pdf-parse-fork tem side-effects pesados, lazy load
    const mod = (await import('pdf-parse-fork')) as unknown as { default: (b: Buffer) => Promise<{ text: string }> };
    const r = await mod.default(buf);
    return cleanText(r.text);
  }
  if (isDocx) {
    const mod = (await import('mammoth')) as unknown as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const r = await mod.extractRawText({ buffer: buf });
    return cleanText(r.value);
  }
  if (isMd || isTxt) {
    return cleanText(buf.toString('utf-8'));
  }
  // Fallback: tenta decodificar como UTF-8 (talvez HTML salvo)
  const asString = buf.toString('utf-8');
  if (asString.includes('<') && asString.includes('>')) return htmlToText(asString);
  return cleanText(asString);
}

function cleanText(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
