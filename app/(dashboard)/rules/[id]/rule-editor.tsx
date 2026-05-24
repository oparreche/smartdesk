'use client';

import { useState, useTransition } from 'react';
import { updateRuleAction } from '../actions';
import type { Action, RuleDefinition, RuleTrigger } from '@/src/services/rules/schema';
import type { Condition } from '@/src/services/layouts/schema';

const TRIGGER_LABELS: Record<RuleTrigger, string> = {
  ticket_created: 'Ticket criado',
  ticket_updated: 'Ticket atualizado',
  ticket_enriched: 'Ticket enriquecido',
  email_received: 'Email recebido',
  form_submitted: 'Formulário enviado',
};

const TRIGGER_HINT: Record<RuleTrigger, string> = {
  ticket_created: 'Toda vez que um ticket novo entrar no sistema.',
  ticket_updated: 'Quando status, prioridade, fila ou responsável mudarem.',
  ticket_enriched: 'Depois que uma integração de API enriquece o ticket.',
  email_received: 'Quando o Gmail conectado receber um email novo.',
  form_submitted: 'Quando alguém envia um formulário publicado.',
};

const ACTION_LABELS: Record<Action['type'], string> = {
  set_priority: 'Definir prioridade',
  set_status: 'Definir status',
  add_tag: 'Adicionar tag',
  remove_tag: 'Remover tag',
  assign_queue: 'Atribuir à fila',
  assign_user: 'Atribuir ao usuário',
  assign_round_robin: 'Atribuir por rodízio',
  add_internal_note: 'Adicionar nota interna',
  add_alert: 'Adicionar alerta no ticket',
};

const ACTION_ICON: Record<Action['type'], string> = {
  set_priority: '↑',
  set_status: '◐',
  add_tag: '＋',
  remove_tag: '−',
  assign_queue: '⇣',
  assign_user: '@',
  assign_round_robin: '↻',
  add_internal_note: '✎',
  add_alert: '!',
};

const PRIORITIES = ['low', 'normal', 'high', 'urgent', 'critical'] as const;
const STATUSES = ['new', 'open', 'in_progress', 'pending_customer', 'pending_third_party', 'resolved', 'closed', 'cancelled'] as const;
const VARIANTS = ['info', 'success', 'warning', 'destructive'] as const;
const OPERATORS = [
  'exists', 'not_exists', 'empty', 'not_empty',
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
  'contains', 'not_contains',
] as const;

const OPERATOR_LABEL: Record<typeof OPERATORS[number], string> = {
  exists: 'existe',
  not_exists: 'não existe',
  empty: 'está vazio',
  not_empty: 'não está vazio',
  eq: '= igual a',
  ne: '≠ diferente de',
  gt: '> maior que',
  gte: '≥ maior ou igual a',
  lt: '< menor que',
  lte: '≤ menor ou igual a',
  contains: 'contém',
  not_contains: 'não contém',
};

const OPERATORS_NO_VALUE = new Set(['exists', 'not_exists', 'empty', 'not_empty']);

type SimpleCondition = { field: string; op: typeof OPERATORS[number]; value?: unknown };

type Props = {
  id: string;
  initial: RuleDefinition;
};

export function RuleEditor({ id, initial }: Props) {
  const [def, setDef] = useState<RuleDefinition>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function patch(p: Partial<RuleDefinition>) {
    setDef((prev) => ({ ...prev, ...p }));
  }

  function setAction(i: number, action: Action) {
    setDef((prev) => {
      const actions = prev.actions.slice();
      actions[i] = action;
      return { ...prev, actions };
    });
  }

  function addAction() {
    setDef((prev) => ({
      ...prev,
      actions: [...prev.actions, { type: 'add_tag', value: 'nova-tag' }],
    }));
  }

  function removeAction(i: number) {
    setDef((prev) => {
      const actions = prev.actions.filter((_, idx) => idx !== i);
      if (actions.length === 0) actions.push({ type: 'add_tag', value: 'auto' });
      return { ...prev, actions };
    });
  }

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set('id', id);
    fd.set('definitionJson', JSON.stringify(def));
    startTransition(async () => {
      try {
        await updateRuleAction(fd);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  const simpleCond = isSimpleCondition(def.conditions) ? def.conditions : null;
  const noValue = simpleCond ? OPERATORS_NO_VALUE.has(simpleCond.op) : false;

  return (
    <div className="flex flex-col gap-5">
      {/* Identificação */}
      <Section eyebrow="01" title="Identificação">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
          <Field label="Nome" hint="Use uma frase curta — facilita ler depois na lista.">
            <input
              value={def.name}
              onChange={(e) => patch({ name: e.target.value })}
              maxLength={120}
              className={inputClass}
            />
          </Field>
          <Field label="Ordem" hint="Menor número roda primeiro.">
            <input
              type="number"
              value={def.runOrder}
              min={0}
              max={1000}
              onChange={(e) => patch({ runOrder: Number(e.target.value) })}
              className={`${inputClass} numeral-serif text-base`}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Toggle
            active={def.enabled}
            onChange={(v) => patch({ enabled: v })}
            label="Ativa"
            activeClass="border-success bg-success-soft text-success"
          />
          <Toggle
            active={def.stopAfterMatch}
            onChange={(v) => patch({ stopAfterMatch: v })}
            label="Parar após match"
            hint="não rodar regras seguintes"
            activeClass="border-warning bg-warning-soft text-warning"
          />
        </div>
      </Section>

      {/* Trigger */}
      <Section eyebrow="02" title="Gatilho">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr]">
          <div className="relative">
            <select
              value={def.trigger}
              onChange={(e) => patch({ trigger: e.target.value as RuleTrigger })}
              className={`${inputClass} w-full appearance-none pr-8`}
            >
              {(Object.keys(TRIGGER_LABELS) as RuleTrigger[]).map((t) => (
                <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
              ))}
            </select>
            <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              ▾
            </span>
          </div>
          <p className="rounded-sm border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {TRIGGER_HINT[def.trigger]}
          </p>
        </div>
      </Section>

      {/* Condições */}
      <Section eyebrow="03" title="Condições" hint="Filtrar quando a regra deve rodar. Vazio = sempre.">
        {def.conditions && !simpleCond ? (
          <p className="rounded-sm border border-warning/30 bg-warning-soft/50 px-3 py-2 text-xs leading-relaxed text-warning">
            Condição composta (all/any/not) detectada — só pode ser editada via JSON avançado.
          </p>
        ) : null}

        {simpleCond ? (
          <div className="rounded-sm border border-border bg-surface-raised p-3">
            <p className="mb-2 font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
              if
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1.5fr_2fr_auto]">
              <input
                value={simpleCond.field}
                placeholder="partner.tier"
                onChange={(e) =>
                  patch({ conditions: { ...simpleCond, field: e.target.value } as Condition })
                }
                className={`${inputClass} font-mono text-[0.8125rem]`}
              />
              <div className="relative">
                <select
                  value={simpleCond.op}
                  onChange={(e) =>
                    patch({
                      conditions: {
                        ...simpleCond,
                        op: e.target.value as SimpleCondition['op'],
                      } as Condition,
                    })
                  }
                  className={`${inputClass} w-full appearance-none pr-8`}
                >
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>
                  ))}
                </select>
                <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  ▾
                </span>
              </div>
              <input
                value={simpleCond.value === undefined ? '' : String(simpleCond.value)}
                placeholder={noValue ? '— sem valor —' : 'valor'}
                disabled={noValue}
                onChange={(e) =>
                  patch({ conditions: { ...simpleCond, value: e.target.value } as Condition })
                }
                className={`${inputClass} ${noValue ? 'opacity-40' : ''}`}
              />
              <button
                type="button"
                onClick={() => patch({ conditions: undefined })}
                className="rounded-sm border border-border bg-surface px-2 text-xs text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
                title="Remover condição"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              patch({
                conditions: { field: 'partner.tier', op: 'eq', value: 'premium' } as Condition,
              })
            }
            className="inline-flex items-center gap-1.5 self-start rounded-sm border border-dashed border-primary/40 bg-primary-soft/50 px-3 py-1.5 text-xs font-medium text-primary hover:border-primary hover:bg-primary-soft"
          >
            <span aria-hidden>＋</span> Adicionar condição
          </button>
        )}
      </Section>

      {/* Ações */}
      <Section
        eyebrow="04"
        title={`Ações · ${def.actions.length}`}
        hint="Executadas em ordem quando o gatilho dispara e as condições passam."
        right={
          <button
            type="button"
            onClick={addAction}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-raised px-2.5 py-1 text-xs text-foreground-secondary hover:bg-muted hover:text-foreground"
          >
            <span aria-hidden>＋</span> Ação
          </button>
        }
      >
        <ol className="flex flex-col gap-3">
          {def.actions.map((a, i) => (
            <li
              key={i}
              className="group rounded-sm border border-border bg-surface-raised p-3 shadow-xs transition-colors hover:border-border-strong"
            >
              <header className="mb-3 flex items-center gap-2">
                <span className="numeral-serif flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[0.75rem] font-medium text-primary-foreground">
                  {i + 1}
                </span>
                <span className="font-mono text-base text-primary" aria-hidden>
                  {ACTION_ICON[a.type]}
                </span>
                <div className="relative flex-1 max-w-xs">
                  <select
                    value={a.type}
                    onChange={(e) =>
                      setAction(i, defaultActionFor(e.target.value as Action['type']))
                    }
                    className={`${inputClass} w-full appearance-none pr-8`}
                  >
                    {(Object.keys(ACTION_LABELS) as Action['type'][]).map((t) => (
                      <option key={t} value={t}>{ACTION_LABELS[t]}</option>
                    ))}
                  </select>
                  <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    ▾
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeAction(i)}
                  className="ml-auto rounded-sm border border-border bg-surface px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
                  title="Remover ação"
                >
                  ✕
                </button>
              </header>
              <ActionFormBody action={a} onChange={(next) => setAction(i, next)} />
            </li>
          ))}
        </ol>
      </Section>

      {/* Sticky footer com Salvar */}
      <div className="sticky bottom-0 -mx-8 mt-4 border-t border-border bg-surface/95 px-8 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs">
            {error ? (
              <span className="text-destructive">⚠ {error}</span>
            ) : saved ? (
              <span className="text-success">✓ Alterações salvas</span>
            ) : (
              <span className="text-muted-foreground">
                Edição local — clique em <span className="font-medium text-foreground">Salvar</span> pra publicar.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
          >
            {pending ? 'Salvando…' : 'Salvar regra'}
            <kbd className="hidden font-mono text-[0.6875rem] opacity-70 md:inline">↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  hint,
  right,
  children,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="divider-eyebrow text-muted-foreground">
            <span className="numeral-serif text-[0.6875rem] text-primary">{eyebrow}</span>
            <span className="mx-1.5 opacity-40">·</span>
            {title}
          </p>
          {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {right}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Toggle({
  active,
  onChange,
  label,
  hint,
  activeClass,
}: {
  active: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? activeClass
          : 'border-border bg-surface-raised text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
          active ? 'border-current bg-current/20' : 'border-current'
        }`}
        aria-hidden
      >
        {active ? <span className="text-[0.625rem] leading-none">✓</span> : null}
      </span>
      {label}
      {hint ? <span className="opacity-60">· {hint}</span> : null}
    </button>
  );
}

function ActionFormBody({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  switch (action.type) {
    case 'set_priority':
      return (
        <Field label="Prioridade">
          <SelectBox
            value={action.value}
            onChange={(v) => onChange({ ...action, value: v as typeof action.value })}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          />
        </Field>
      );
    case 'set_status':
      return (
        <Field label="Status">
          <SelectBox
            value={action.value}
            onChange={(v) => onChange({ ...action, value: v as typeof action.value })}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </Field>
      );
    case 'add_tag':
    case 'remove_tag':
      return (
        <Field label="Nome da tag">
          <input
            value={action.value}
            onChange={(e) => onChange({ ...action, value: e.target.value })}
            className={`${inputClass} font-mono text-[0.8125rem]`}
            maxLength={60}
            placeholder="vip"
          />
        </Field>
      );
    case 'assign_queue':
      return (
        <Field label="Slug da fila">
          <input
            value={action.queueSlug}
            onChange={(e) => onChange({ ...action, queueSlug: e.target.value })}
            className={`${inputClass} font-mono text-[0.8125rem]`}
            placeholder="suporte"
            maxLength={60}
          />
        </Field>
      );
    case 'assign_user':
      return (
        <Field label="Email do usuário">
          <input
            type="email"
            value={action.email}
            onChange={(e) => onChange({ ...action, email: e.target.value })}
            className={inputClass}
            placeholder="agent@empresa.com"
          />
        </Field>
      );
    case 'assign_round_robin':
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
          <Field label="Slug da fila (opcional)" hint="Vazio = usa a fila do próprio ticket.">
            <input
              value={action.queueSlug ?? ''}
              onChange={(e) =>
                onChange({ ...action, queueSlug: e.target.value || undefined })
              }
              className={`${inputClass} font-mono text-[0.8125rem]`}
              placeholder="suporte"
              maxLength={60}
            />
          </Field>
          <Field label="Balancear" hint="Considera tickets abertos por agente.">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={action.balanceByWorkload ?? true}
                onChange={(e) =>
                  onChange({ ...action, balanceByWorkload: e.target.checked })
                }
              />
              <span>Por carga de trabalho</span>
            </label>
          </Field>
        </div>
      );
    case 'add_internal_note':
      return (
        <Field label="Conteúdo" hint="Suporta {{vars}} do ticket.">
          <textarea
            value={action.body}
            onChange={(e) => onChange({ ...action, body: e.target.value })}
            rows={3}
            maxLength={5000}
            className={inputClass}
            placeholder="Cliente {{ticket.requester.name}} marcado como VIP."
          />
        </Field>
      );
    case 'add_alert':
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr]">
          <Field label="Variante">
            <SelectBox
              value={action.variant}
              onChange={(v) => onChange({ ...action, variant: v as typeof action.variant })}
              options={VARIANTS.map((v) => ({ value: v, label: v }))}
            />
          </Field>
          <Field label="Mensagem">
            <input
              value={action.message}
              onChange={(e) => onChange({ ...action, message: e.target.value })}
              className={inputClass}
              maxLength={500}
              placeholder="Parceiro VIP detectado: {{partner.name}}"
            />
          </Field>
        </div>
      );
  }
}

function SelectBox({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} w-full appearance-none pr-8`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        ▾
      </span>
    </div>
  );
}

function defaultActionFor(type: Action['type']): Action {
  switch (type) {
    case 'set_priority': return { type: 'set_priority', value: 'high' };
    case 'set_status': return { type: 'set_status', value: 'in_progress' };
    case 'add_tag': return { type: 'add_tag', value: 'auto' };
    case 'remove_tag': return { type: 'remove_tag', value: 'auto' };
    case 'assign_queue': return { type: 'assign_queue', queueSlug: 'suporte' };
    case 'assign_user': return { type: 'assign_user', email: 'admin@demo.local' };
    case 'assign_round_robin': return { type: 'assign_round_robin', balanceByWorkload: true };
    case 'add_internal_note': return { type: 'add_internal_note', body: 'Regra aplicada.' };
    case 'add_alert': return { type: 'add_alert', variant: 'warning', message: 'Atenção.' };
  }
}

function isSimpleCondition(c: Condition | undefined): c is SimpleCondition {
  return !!c && 'field' in c;
}

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
