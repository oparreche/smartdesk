import type { Action, RuleTrigger } from './schema';
import type { Condition } from '@/src/services/layouts/schema';

export const TRIGGER_LABEL: Record<RuleTrigger, string> = {
  ticket_created: 'Ticket criado',
  ticket_updated: 'Ticket atualizado',
  ticket_enriched: 'Ticket enriquecido',
  email_received: 'Email recebido',
  form_submitted: 'Formulário enviado',
};

const OP_LABEL: Record<string, string> = {
  exists: 'existe',
  not_exists: 'não existe',
  empty: 'está vazio',
  not_empty: 'não está vazio',
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: 'contém',
  not_contains: 'não contém',
  in: 'em',
  not_in: 'não em',
};

const NO_VALUE_OPS = new Set(['exists', 'not_exists', 'empty', 'not_empty']);

/** Resumo curto e legível de uma condição (ou "Sempre" se vazia). */
export function describeCondition(c: Condition | null | undefined): string {
  if (!c) return 'Sempre';
  if ('all' in c) return c.all.map(describeCondition).join(' e ');
  if ('any' in c) return c.any.map(describeCondition).join(' ou ');
  if ('not' in c) return `não (${describeCondition(c.not)})`;
  const op = OP_LABEL[c.op] ?? c.op;
  if (NO_VALUE_OPS.has(c.op)) return `${c.field} ${op}`;
  const val = Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '');
  return `${c.field} ${op} ${val}`.trim();
}

export type ActionChip = { icon: string; label: string };

/** Converte uma ação numa "chip" legível (ícone + texto). */
export function describeAction(a: Action): ActionChip {
  switch (a.type) {
    case 'set_priority':
      return { icon: '↑', label: `prioridade: ${a.value}` };
    case 'set_status':
      return { icon: '◐', label: `status: ${a.value}` };
    case 'add_tag':
      return { icon: '＋', label: `tag: ${a.value}` };
    case 'remove_tag':
      return { icon: '−', label: `remover tag: ${a.value}` };
    case 'assign_queue':
      return { icon: '⇣', label: `fila: ${a.queueSlug}` };
    case 'assign_user':
      return { icon: '@', label: `atribuir: ${a.email}` };
    case 'assign_round_robin':
      return { icon: '↻', label: a.queueSlug ? `rodízio: ${a.queueSlug}` : 'rodízio' };
    case 'add_internal_note':
      return { icon: '✎', label: 'nota interna' };
    case 'add_alert':
      return { icon: '!', label: `alerta: ${a.variant}` };
  }
}

/** Parseia o campo Json `actions` do banco numa lista de chips (tolerante a lixo). */
export function describeActionsJson(value: unknown): ActionChip[] {
  if (!Array.isArray(value)) return [];
  const chips: ActionChip[] = [];
  for (const raw of value) {
    if (raw && typeof raw === 'object' && 'type' in raw) {
      try {
        chips.push(describeAction(raw as Action));
      } catch {
        /* ignora ação malformada */
      }
    }
  }
  return chips;
}

/** Coage o campo Json `conditions` do banco em Condition (ou undefined). */
export function conditionFromJson(value: unknown): Condition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as Condition;
}
