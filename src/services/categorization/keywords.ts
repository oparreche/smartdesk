const DIACRITICS = /[̀-ͯ]/g;

/**
 * Normaliza texto para comparação: minúsculas, sem acento, espaços colapsados.
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Conta quantas palavras-chave distintas (>= 2 chars) aparecem no texto.
 * Match por substring no texto normalizado — cobre flexões simples
 * ("valor" casa "valores") e expressões ("nao caiu").
 */
export function countKeywordMatches(text: string, keywords: string[]): { count: number; matched: string[] } {
  const haystack = normalizeText(text);
  const matched: string[] = [];
  const seen = new Set<string>();
  for (const raw of keywords) {
    const kw = normalizeText(raw);
    if (kw.length < 2 || seen.has(kw)) continue;
    seen.add(kw);
    if (haystack.includes(kw)) matched.push(raw.trim());
  }
  return { count: matched.length, matched };
}

/**
 * Parseia a entrada de palavras-chave do tenant (texto livre separado por
 * vírgula ou quebra de linha) em um array limpo e deduplicado.
 */
export function parseKeywords(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of input.split(/[,\n]/)) {
    const kw = part.trim();
    if (!kw) continue;
    const key = normalizeText(kw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
  }
  return out.slice(0, 50);
}

/** Coerção segura do campo Json `keywords` do banco para string[]. */
export function asKeywordArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}
