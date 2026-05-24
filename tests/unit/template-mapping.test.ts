import { describe, it, expect } from 'vitest';
import { renderTemplate, renderTemplateDeep, TemplateError } from '@/src/services/integrations/template';
import { applyMapping, isSafeJsonPath, MappingError } from '@/src/services/integrations/mapping';

describe('renderTemplate', () => {
  it('substitui variável simples', () => {
    expect(renderTemplate('Hello {{name}}', { name: 'World' })).toBe('Hello World');
  });

  it('substitui dot-path', () => {
    expect(
      renderTemplate('email={{ticket.requester.email}}', {
        ticket: { requester: { email: 'a@b.com' } },
      }),
    ).toBe('email=a@b.com');
  });

  it('vira string vazia se ausente (não-strict)', () => {
    expect(renderTemplate('x={{missing}}y', {})).toBe('x=y');
  });

  it('lança em modo strict se ausente', () => {
    expect(() => renderTemplate('{{missing}}', {}, { strict: true })).toThrow(TemplateError);
  });

  it('bloqueia env.*', () => {
    expect(() => renderTemplate('{{env.SECRET}}', { env: { SECRET: 'leak' } })).toThrow(TemplateError);
  });

  it('bloqueia __proto__', () => {
    const ctx = { foo: 'bar' } as Record<string, unknown>;
    expect(renderTemplate('{{__proto__.toString}}', ctx)).toBe('');
  });

  it('aceita número, boolean, Date', () => {
    expect(renderTemplate('n={{n}} b={{b}}', { n: 42, b: true })).toBe('n=42 b=true');
  });

  it('JSONifica objetos', () => {
    expect(renderTemplate('{{x}}', { x: { a: 1 } })).toBe('{"a":1}');
  });
});

describe('renderTemplateDeep', () => {
  it('substitui em objetos e arrays', () => {
    const out = renderTemplateDeep(
      {
        url: 'https://api/x?email={{email}}',
        body: { id: '{{id}}', tags: ['{{tag}}', 'fixed'] },
      },
      { email: 'a@b.com', id: '123', tag: 'vip' },
    );
    expect(out).toEqual({
      url: 'https://api/x?email=a@b.com',
      body: { id: '123', tags: ['vip', 'fixed'] },
    });
  });
});

describe('isSafeJsonPath', () => {
  it('permite paths simples', () => {
    expect(isSafeJsonPath('$.data.id')).toBe(true);
    expect(isSafeJsonPath('$.data.items[0].name')).toBe(true);
    expect(isSafeJsonPath('$.data.items[*].name')).toBe(true);
    expect(isSafeJsonPath('$..price')).toBe(true);
  });
  it('bloqueia filtros script ?()', () => {
    expect(isSafeJsonPath('$.data[?(@.price > 10)]')).toBe(false);
  });
  it('bloqueia expressões script ()', () => {
    expect(isSafeJsonPath('$.data.items[(@.length-1)]')).toBe(false);
  });
  it('bloqueia template strings', () => {
    expect(isSafeJsonPath('$.`length`')).toBe(false);
  });
  it('exige $ no início', () => {
    expect(isSafeJsonPath('data.id')).toBe(false);
  });
});

describe('applyMapping', () => {
  const response = {
    data: {
      id: 123,
      name: 'João',
      status: 'active',
      sales: { total: 50000, last_30_days: 8500 },
      brands: [
        { name: 'A', sales: 12000 },
        { name: 'B', sales: 18000 },
      ],
    },
  };

  it('mapeia campos planos', () => {
    const m = applyMapping(response, {
      'partner.id': '$.data.id',
      'partner.name': '$.data.name',
    });
    expect(m).toEqual({ partner: { id: 123, name: 'João' } });
  });

  it('mapeia aninhado profundo', () => {
    const m = applyMapping(response, {
      'partner.sales_total': '$.data.sales.total',
      'partner.sales_last_30_days': '$.data.sales.last_30_days',
    });
    expect(m).toEqual({
      partner: { sales_total: 50000, sales_last_30_days: 8500 },
    });
  });

  it('mapeia arrays', () => {
    const m = applyMapping(response, {
      'partner.brands': '$.data.brands',
    });
    expect(m).toEqual({
      partner: { brands: [{ name: 'A', sales: 12000 }, { name: 'B', sales: 18000 }] },
    });
  });

  it('retorna undefined se não match', () => {
    const m = applyMapping(response, {
      'x.y': '$.data.nonexistent',
    });
    expect(m.x).toEqual({ y: undefined });
  });

  it('bloqueia JSONPath inseguro', () => {
    expect(() =>
      applyMapping(response, {
        'x': '$.data[?(@.id===123)]',
      }),
    ).toThrow(MappingError);
  });

  it('protege contra __proto__ poisoning', () => {
    const obj: Record<string, unknown> = {};
    applyMapping(response, { '__proto__.polluted': '$.data.id' });
    expect((obj as { polluted?: unknown }).polluted).toBeUndefined();
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });
});
