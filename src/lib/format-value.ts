/**
 * Renderização de valores conforme `format` declarado no bloco do Painel Inteligente.
 *
 * Resultado é sempre string (renderizado server-side e enviado para o cliente).
 * Quando o valor não bate com o formato, faz fallback gracioso.
 */
import { maskDocument, maskPhone } from './format';

export type ValueFormat =
  | 'text'
  | 'number'
  | 'currency'
  | 'percentage'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'phone'
  | 'document'
  | 'email'
  | 'url'
  | 'badge';

export type FormatOptions = {
  currency?: string;
  locale?: string;
};

const LOCALE = 'pt-BR';

export function formatValue(
  value: unknown,
  format: ValueFormat = 'text',
  options: FormatOptions = {},
): string {
  if (value === null || value === undefined) return '';
  const locale = options.locale ?? LOCALE;

  switch (format) {
    case 'text':
    case 'badge':
      return stringify(value);

    case 'number': {
      const n = toNumber(value);
      if (n === null) return stringify(value);
      return new Intl.NumberFormat(locale).format(n);
    }

    case 'currency': {
      const n = toNumber(value);
      if (n === null) return stringify(value);
      try {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: options.currency ?? 'BRL',
        }).format(n);
      } catch {
        return stringify(n);
      }
    }

    case 'percentage': {
      const n = toNumber(value);
      if (n === null) return stringify(value);
      // Heurística: se valor está entre -1 e 1, trata como fração; senão, valor inteiro %.
      const numerical = n >= -1 && n <= 1 ? n : n / 100;
      return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
        numerical,
      );
    }

    case 'date': {
      const d = toDate(value);
      if (!d) return stringify(value);
      return new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(d);
    }

    case 'datetime': {
      const d = toDate(value);
      if (!d) return stringify(value);
      return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(d);
    }

    case 'boolean': {
      if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
      const s = stringify(value).toLowerCase();
      if (['true', '1', 'yes', 'sim'].includes(s)) return 'Sim';
      if (['false', '0', 'no', 'não', 'nao'].includes(s)) return 'Não';
      return stringify(value);
    }

    case 'phone':
      return maskPhone(stringify(value));

    case 'document':
      return maskDocument(stringify(value));

    case 'email':
    case 'url':
      return stringify(value);
  }
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.trim().replace(/\s/g, '').replace(/^R\$\s*/i, '').replace(',', '.');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
