import 'server-only';
import { JSONPath } from 'jsonpath-plus';

/**
 * Aplica mapeamento de resposta da integração: dado um objeto JSON e um conjunto
 * de pares "alias" → "JSONPath", devolve objeto plano com aliases preenchidos.
 *
 * Aliases podem usar dot-paths (`partner.id`, `partner.name`) — são expandidos
 * para árvore na saída:
 *   { "partner.id": "$.data.id" } → { partner: { id: 123 } }
 *
 * Segurança:
 *  - JSONPath com `eval: false` (sem expressões JS arbitrárias).
 *  - Sem callbacks customizados.
 */

export class MappingError extends Error {
  constructor(public alias: string, public reason: string) {
    super(`Mapping ${alias}: ${reason}`);
    this.name = 'MappingError';
  }
}

export type ResponseMapping = Record<string, string>;

export type MappedData = Record<string, unknown>;

/**
 * Aplica o mapping sobre `response`. Retorna estrutura aninhada.
 *
 * Exemplo:
 *   response = { data: { id: 1, name: 'X' } }
 *   mapping = { 'partner.id': '$.data.id', 'partner.name': '$.data.name' }
 *   → { partner: { id: 1, name: 'X' } }
 */
export function applyMapping(response: unknown, mapping: ResponseMapping): MappedData {
  const out: MappedData = {};

  for (const [alias, jsonPath] of Object.entries(mapping)) {
    if (!isSafeJsonPath(jsonPath)) {
      throw new MappingError(alias, `JSONPath não permitido: ${jsonPath}`);
    }
    let result: unknown;
    try {
      const r = JSONPath({
        path: jsonPath,
        json: response as object,
        wrap: false,
        // sem eval — bloqueia ?(expr) JS, scripts e callbacks
        eval: false,
      });
      result = r;
    } catch (err) {
      throw new MappingError(alias, (err as Error).message);
    }
    setByDotPath(out, alias, result);
  }
  return out;
}

/**
 * Bloqueia padrões perigosos no JSONPath. Subconjunto seguro:
 *  - Permitido: `$`, `.prop`, `['prop']`, `[N]`, `[*]`, `..prop` (descent), `[start:end]`
 *  - Proibido: `?(expr)` (filter scripts), `(expr)` (script expressions), template functions
 */
export function isSafeJsonPath(path: string): boolean {
  if (typeof path !== 'string' || !path) return false;
  if (!path.startsWith('$')) return false;
  if (/[?(]/.test(path)) return false; // bloqueia ?() e ()
  if (/[\$~@]\(/.test(path)) return false;
  if (path.includes('`')) return false; // template strings
  return true;
}

/**
 * Atribui `value` em `obj` usando dot-path, criando objetos intermediários.
 * Sanitiza chaves perigosas.
 */
export function setByDotPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
    const existing = cur[k];
    if (existing === undefined || existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (last === '__proto__' || last === 'constructor' || last === 'prototype') return;
  cur[last] = value;
}
