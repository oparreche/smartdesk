import 'server-only';

/**
 * Template engine simples para substituir `{{path.to.value}}` em strings,
 * usando um objeto de contexto.
 *
 * Segurança:
 *  - `{{env.*}}` é proibido (não vaza env vars do servidor).
 *  - Sem execução de código — apenas lookup de propriedades.
 *  - Valores undefined/null viram string vazia (pode ser configurado para erro).
 *  - Arrays e objetos viram JSON.stringify (raramente usado em templates).
 */

export class TemplateError extends Error {
  constructor(public path: string, public reason: string) {
    super(`Template: ${reason} (path=${path})`);
    this.name = 'TemplateError';
  }
}

const VAR_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export type TemplateOptions = {
  /** Quando true, lança erro se variável não existe; quando false, vira ''. Default false. */
  strict?: boolean;
};

export function renderTemplate(
  template: string,
  context: Record<string, unknown>,
  options: TemplateOptions = {},
): string {
  return template.replace(VAR_RE, (_, rawPath: string) => {
    const path = rawPath.trim();
    if (path.startsWith('env.') || path === 'env') {
      throw new TemplateError(path, 'acesso a env proibido');
    }
    const value = getPath(context, path);
    if (value === undefined || value === null) {
      if (options.strict) throw new TemplateError(path, 'variável ausente');
      return '';
    }
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString();
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  });
}

/**
 * Renderiza templates dentro de uma estrutura JSON arbitrária (objeto/array/string).
 * Útil para body templates de integrações.
 */
export function renderTemplateDeep<T>(value: T, context: Record<string, unknown>, options?: TemplateOptions): T {
  if (typeof value === 'string') {
    return renderTemplate(value, context, options) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => renderTemplateDeep(v, context, options)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = renderTemplateDeep(v, context, options);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Lookup seguro por dot-path. Ignora `__proto__`, `constructor`, etc.
 */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (p === '__proto__' || p === 'constructor' || p === 'prototype') return undefined;
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
