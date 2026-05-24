import { getPath } from '@/src/services/integrations/template';
import type { Condition } from '@/src/services/layouts/schema';

/**
 * Avalia uma condição contra um contexto. Reusado por:
 *  - `visibleWhen` dos blocos do Painel Inteligente
 *  - `conditions` das regras de automação
 *
 * Suporta operadores básicos + boolean combinators (all/any/not).
 */
export function evaluateCondition(condition: Condition | undefined | null, ctx: Record<string, unknown>): boolean {
  if (!condition) return true;

  if ('all' in condition) {
    return condition.all.every((c) => evaluateCondition(c, ctx));
  }
  if ('any' in condition) {
    return condition.any.some((c) => evaluateCondition(c, ctx));
  }
  if ('not' in condition) {
    return !evaluateCondition(condition.not, ctx);
  }

  // Simple { field, op, value }
  const fieldValue = resolveField(condition.field, ctx);
  return applyOperator(fieldValue, condition.op, condition.value);
}

function resolveField(path: string, ctx: Record<string, unknown>): unknown {
  // Aceita tanto "partner.id" quanto "{{partner.id}}"
  const cleaned = path.replace(/^\s*\{\{\s*/, '').replace(/\s*\}\}\s*$/, '').trim();
  return getPath(ctx, cleaned);
}

function applyOperator(fieldValue: unknown, op: string, expected: unknown): boolean {
  switch (op) {
    case 'exists': return fieldValue !== undefined && fieldValue !== null;
    case 'not_exists': return fieldValue === undefined || fieldValue === null;
    case 'empty': return isEmpty(fieldValue);
    case 'not_empty': return !isEmpty(fieldValue);
    case 'eq': return looseEq(fieldValue, expected);
    case 'ne': return !looseEq(fieldValue, expected);
    case 'gt': return compareNumeric(fieldValue, expected, (a, b) => a > b);
    case 'gte': return compareNumeric(fieldValue, expected, (a, b) => a >= b);
    case 'lt': return compareNumeric(fieldValue, expected, (a, b) => a < b);
    case 'lte': return compareNumeric(fieldValue, expected, (a, b) => a <= b);
    case 'contains': return contains(fieldValue, expected);
    case 'not_contains': return !contains(fieldValue, expected);
    case 'in': return Array.isArray(expected) && expected.some((v) => looseEq(fieldValue, v));
    case 'not_in': return Array.isArray(expected) && !expected.some((v) => looseEq(fieldValue, v));
    default: return false;
  }
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Comparação numérica se ambos podem virar número
  const an = toNumber(a);
  const bn = toNumber(b);
  if (an !== null && bn !== null) return an === bn;
  // Comparação string case-insensitive
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase() === b.toLowerCase();
  }
  return false;
}

function compareNumeric(a: unknown, b: unknown, cmp: (x: number, y: number) => boolean): boolean {
  const x = toNumber(a);
  const y = toNumber(b);
  if (x === null || y === null) return false;
  return cmp(x, y);
}

function contains(fieldValue: unknown, expected: unknown): boolean {
  if (fieldValue === null || fieldValue === undefined) return false;
  if (Array.isArray(fieldValue)) {
    return fieldValue.some((item) => looseEq(item, expected));
  }
  const s = typeof fieldValue === 'string' ? fieldValue : JSON.stringify(fieldValue);
  const target = typeof expected === 'string' ? expected : String(expected);
  return s.toLowerCase().includes(target.toLowerCase());
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}
