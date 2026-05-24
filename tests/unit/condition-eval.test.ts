import { describe, it, expect } from 'vitest';
import { evaluateCondition } from '@/src/lib/condition-eval';

const ctx = {
  partner: {
    id: 123,
    name: 'João',
    type: 'premium',
    status: 'active',
    sales_total: 50000,
    sales_last_30_days: 8500,
    brands: [{ name: 'A' }, { name: 'B' }],
  },
  ticket: {
    code: 'HELP-100001',
    priority: 'high',
    tags: ['vip', 'urgent'],
  },
};

describe('evaluateCondition — simples', () => {
  it('exists', () => {
    expect(evaluateCondition({ field: 'partner.id', op: 'exists' }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'partner.unknown', op: 'exists' }, ctx)).toBe(false);
  });

  it('eq case-insensitive em string', () => {
    expect(evaluateCondition({ field: 'partner.type', op: 'eq', value: 'PREMIUM' }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'partner.type', op: 'eq', value: 'free' }, ctx)).toBe(false);
  });

  it('eq numérico cruza tipos', () => {
    expect(evaluateCondition({ field: 'partner.id', op: 'eq', value: '123' }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'partner.id', op: 'eq', value: 123 }, ctx)).toBe(true);
  });

  it('gt e gte', () => {
    expect(evaluateCondition({ field: 'partner.sales_total', op: 'gt', value: 40000 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'partner.sales_total', op: 'gt', value: 50000 }, ctx)).toBe(false);
    expect(evaluateCondition({ field: 'partner.sales_total', op: 'gte', value: 50000 }, ctx)).toBe(true);
  });

  it('contains em array e string', () => {
    expect(evaluateCondition({ field: 'ticket.tags', op: 'contains', value: 'vip' }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'ticket.tags', op: 'contains', value: 'low' }, ctx)).toBe(false);
    expect(evaluateCondition({ field: 'ticket.code', op: 'contains', value: 'HELP' }, ctx)).toBe(true);
  });

  it('in e not_in', () => {
    expect(evaluateCondition({ field: 'ticket.priority', op: 'in', value: ['high', 'urgent'] }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'ticket.priority', op: 'not_in', value: ['low', 'normal'] }, ctx)).toBe(true);
  });

  it('empty e not_empty', () => {
    expect(evaluateCondition({ field: 'partner.brands', op: 'not_empty' }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'partner.unknown', op: 'empty' }, ctx)).toBe(true);
  });

  it('aceita {{var}} como field', () => {
    expect(evaluateCondition({ field: '{{partner.type}}', op: 'eq', value: 'premium' }, ctx)).toBe(true);
  });
});

describe('evaluateCondition — combinators', () => {
  it('all (AND)', () => {
    expect(
      evaluateCondition(
        {
          all: [
            { field: 'partner.type', op: 'eq', value: 'premium' },
            { field: 'partner.sales_total', op: 'gt', value: 40000 },
          ],
        },
        ctx,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        {
          all: [
            { field: 'partner.type', op: 'eq', value: 'premium' },
            { field: 'partner.sales_total', op: 'gt', value: 999999 },
          ],
        },
        ctx,
      ),
    ).toBe(false);
  });

  it('any (OR)', () => {
    expect(
      evaluateCondition(
        {
          any: [
            { field: 'partner.type', op: 'eq', value: 'free' },
            { field: 'partner.sales_total', op: 'gt', value: 40000 },
          ],
        },
        ctx,
      ),
    ).toBe(true);
  });

  it('not', () => {
    expect(evaluateCondition({ not: { field: 'partner.type', op: 'eq', value: 'free' } }, ctx)).toBe(true);
  });

  it('aninhado: not(any(...)) ', () => {
    expect(
      evaluateCondition(
        {
          not: {
            any: [
              { field: 'partner.type', op: 'eq', value: 'free' },
              { field: 'partner.status', op: 'eq', value: 'inactive' },
            ],
          },
        },
        ctx,
      ),
    ).toBe(true);
  });
});

describe('evaluateCondition — null/undefined safety', () => {
  it('condição null/undefined → true', () => {
    expect(evaluateCondition(null, ctx)).toBe(true);
    expect(evaluateCondition(undefined, ctx)).toBe(true);
  });
});
