import { describe, it, expect } from 'vitest';
import { formatValue } from '@/src/lib/format-value';

describe('formatValue', () => {
  it('text com string', () => {
    expect(formatValue('hello', 'text')).toBe('hello');
  });

  it('number pt-BR', () => {
    expect(formatValue(1234.5, 'number')).toMatch(/1\.234,5/);
  });

  it('currency BRL', () => {
    const v = formatValue(8500, 'currency', { currency: 'BRL' });
    // Em CI o caractere de NBSP pode variar; checamos as partes
    expect(v).toContain('R$');
    expect(v).toMatch(/8\.500/);
  });

  it('currency USD', () => {
    const v = formatValue(99.99, 'currency', { currency: 'USD' });
    expect(v).toMatch(/US\$|\$/);
  });

  it('percentage como fração (0–1)', () => {
    expect(formatValue(0.42, 'percentage')).toMatch(/42\s*%/);
  });

  it('percentage como inteiro (>1)', () => {
    expect(formatValue(42, 'percentage')).toMatch(/42\s*%/);
  });

  it('date', () => {
    // Aceita 21 ou 22/05/2026 — depende de timezone (string ISO sem TZ vira UTC)
    expect(formatValue('2026-05-22', 'date')).toMatch(/2[12]\/0?5\/2026/);
  });

  it('datetime', () => {
    const v = formatValue('2026-05-22T14:30:00Z', 'datetime');
    expect(v).toContain('2026');
  });

  it('boolean true e false em PT-BR', () => {
    expect(formatValue(true, 'boolean')).toBe('Sim');
    expect(formatValue(false, 'boolean')).toBe('Não');
    expect(formatValue('1', 'boolean')).toBe('Sim');
    expect(formatValue('0', 'boolean')).toBe('Não');
  });

  it('document CPF', () => {
    expect(formatValue('12345678901', 'document')).toBe('123.456.789-01');
  });

  it('document CNPJ', () => {
    expect(formatValue('00000000000191', 'document')).toBe('00.000.000/0001-91');
  });

  it('phone celular', () => {
    expect(formatValue('11999998888', 'phone')).toBe('(11) 99999-8888');
  });

  it('null/undefined → string vazia', () => {
    expect(formatValue(null, 'text')).toBe('');
    expect(formatValue(undefined, 'currency')).toBe('');
  });

  it('formato inválido cai no fallback', () => {
    expect(formatValue('abc', 'number')).toBe('abc');
    expect(formatValue('xyz', 'date')).toBe('xyz');
  });
});
