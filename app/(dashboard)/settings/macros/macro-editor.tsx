'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { createMacroAction, updateMacroAction, type MacroState } from './actions';
import type { Action } from '@/src/services/rules/schema';

type Props =
  | { mode: 'create' }
  | {
      mode: 'edit';
      id: string;
      initial: {
        name: string;
        shortcut: string | null;
        body: string;
        enabled: boolean;
        actions: Action[];
      };
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
  add_alert: 'Adicionar alerta',
};

const initial: MacroState = undefined;

export function MacroEditor(props: Props) {
  const isEdit = props.mode === 'edit';
  const [state, formAction, pending] = useActionState(
    isEdit ? updateMacroAction : createMacroAction,
    initial,
  );
  const [actions, setActions] = useState<Action[]>(
    isEdit ? props.initial.actions : [],
  );

  function addAction(type: Action['type']) {
    setActions((prev) => [...prev, defaultActionFor(type)]);
  }

  function removeAction(i: number) {
    setActions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function patchAction(i: number, patch: Partial<Action>) {
    setActions((prev) =>
      prev.map((a, idx) => (idx === i ? ({ ...a, ...patch } as Action) : a)),
    );
  }

  return (
    <form
      action={formAction}
      className="card flex flex-col gap-5 p-5"
    >
      {isEdit ? <input type="hidden" name="id" value={props.id} /> : null}
      <input type="hidden" name="actionsJson" value={JSON.stringify(actions)} />

      <header>
        <p className="divider-eyebrow text-muted-foreground">
          <span className="numeral-serif text-[0.6875rem] text-primary">
            {isEdit ? 'EDIT' : '01'}
          </span>
          <span className="mx-1.5 opacity-40">·</span>
          {isEdit ? 'Editar macro' : 'Nova macro'}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
        <Field label="Nome" hint="Como aparece no picker.">
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={isEdit ? props.initial.name : ''}
            placeholder="ex: Confirmação de recebimento"
            className={inputClass}
          />
        </Field>
        <Field label="Atalho" hint=":greeting (opcional)">
          <input
            name="shortcut"
            maxLength={40}
            defaultValue={isEdit ? props.initial.shortcut ?? '' : ''}
            placeholder=":greeting"
            className={`${inputClass} font-mono text-[0.8125rem]`}
          />
        </Field>
      </div>

      <Field
        label="Corpo da resposta"
        hint="Use {{ticket.requester.name}}, {{agent.name}}, etc."
      >
        <textarea
          name="body"
          required
          rows={6}
          maxLength={20_000}
          defaultValue={isEdit ? props.initial.body : ''}
          placeholder="Olá {{ticket.requester.name}},&#10;&#10;Recebemos seu chamado {{ticket.code}} e em breve um atendente entrará em contato.&#10;&#10;Atenciosamente,&#10;{{agent.name}}"
          className={`${inputClass} leading-relaxed`}
        />
      </Field>

      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={isEdit ? props.initial.enabled : true}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium text-foreground">Ativa</span>{' '}
          <span className="text-muted-foreground">— desativadas não aparecem no picker do composer</span>
        </span>
      </label>

      {/* Ações opcionais */}
      <div className="rounded-sm border border-border bg-surface-raised p-3">
        <header className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            Ações disparadas (opcional)
          </p>
          <div className="relative">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addAction(e.target.value as Action['type']);
                e.target.value = '';
              }}
              className="rounded-sm border border-border bg-surface px-2 py-1 text-xs text-foreground-secondary hover:bg-muted"
            >
              <option value="">＋ Adicionar ação…</option>
              {(Object.keys(ACTION_LABELS) as Action['type'][]).map((t) => (
                <option key={t} value={t}>{ACTION_LABELS[t]}</option>
              ))}
            </select>
          </div>
        </header>
        {actions.length === 0 ? (
          <p className="text-[0.6875rem] text-muted-foreground">
            Nenhuma ação. A macro só inserirá texto no composer.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {actions.map((a, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-sm border border-border bg-surface p-2"
              >
                <span className="numeral-serif text-[0.75rem] text-primary">{i + 1}.</span>
                <span className="text-xs font-medium text-foreground">{ACTION_LABELS[a.type]}</span>
                <span className="text-[0.6875rem] text-muted-foreground">·</span>
                <ActionValueInput
                  action={a}
                  onChange={(patch) => patchAction(i, patch)}
                />
                <button
                  type="button"
                  onClick={() => removeAction(i)}
                  className="ml-auto rounded-sm border border-border bg-surface px-1.5 text-[0.6875rem] text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
        >
          ⚠ {state.error}
        </p>
      ) : null}
      {state && state.ok && !isEdit ? (
        <p className="rounded-sm border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
          ✓ Macro criada
        </p>
      ) : null}

      <footer className="flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
        {isEdit ? (
          <Link
            href="/settings/macros"
            className="rounded-sm border border-border bg-surface px-3 py-1.5 text-xs text-foreground-secondary hover:bg-muted"
          >
            Voltar
          </Link>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-sm bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
        >
          {pending ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar macro'}
        </button>
      </footer>
    </form>
  );
}

function ActionValueInput({
  action,
  onChange,
}: {
  action: Action;
  onChange: (patch: Partial<Action>) => void;
}) {
  if (action.type === 'set_priority') {
    return (
      <select
        value={action.value}
        onChange={(e) => onChange({ value: e.target.value as typeof action.value })}
        className="rounded-sm border border-border bg-surface px-2 py-0.5 text-xs"
      >
        {['low', 'normal', 'high', 'urgent', 'critical'].map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
    );
  }
  if (action.type === 'set_status') {
    return (
      <select
        value={action.value}
        onChange={(e) => onChange({ value: e.target.value as typeof action.value })}
        className="rounded-sm border border-border bg-surface px-2 py-0.5 text-xs"
      >
        {['new', 'open', 'in_progress', 'pending_customer', 'pending_third_party', 'resolved', 'closed'].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    );
  }
  if (action.type === 'add_tag' || action.type === 'remove_tag') {
    return (
      <input
        value={action.value}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder="tag"
        className="rounded-sm border border-border bg-surface px-2 py-0.5 font-mono text-xs"
      />
    );
  }
  if (action.type === 'assign_queue') {
    return (
      <input
        value={action.queueSlug}
        onChange={(e) => onChange({ queueSlug: e.target.value })}
        placeholder="suporte"
        className="rounded-sm border border-border bg-surface px-2 py-0.5 font-mono text-xs"
      />
    );
  }
  if (action.type === 'assign_user') {
    return (
      <input
        value={action.email}
        onChange={(e) => onChange({ email: e.target.value })}
        placeholder="agent@empresa.com"
        className="rounded-sm border border-border bg-surface px-2 py-0.5 text-xs"
      />
    );
  }
  if (action.type === 'assign_round_robin') {
    return (
      <span className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
        <input
          value={action.queueSlug ?? ''}
          onChange={(e) => onChange({ queueSlug: e.target.value || undefined })}
          placeholder="fila (vazia = ticket)"
          className="rounded-sm border border-border bg-surface px-2 py-0.5 font-mono text-xs"
        />
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={action.balanceByWorkload ?? true}
            onChange={(e) => onChange({ balanceByWorkload: e.target.checked })}
          />
          balanceado
        </label>
      </span>
    );
  }
  if (action.type === 'add_internal_note') {
    return (
      <input
        value={action.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder="nota interna"
        className="flex-1 rounded-sm border border-border bg-surface px-2 py-0.5 text-xs"
      />
    );
  }
  if (action.type === 'add_alert') {
    return (
      <input
        value={action.message}
        onChange={(e) => onChange({ message: e.target.value })}
        placeholder="mensagem do alerta"
        className="flex-1 rounded-sm border border-border bg-surface px-2 py-0.5 text-xs"
      />
    );
  }
  return null;
}

function defaultActionFor(type: Action['type']): Action {
  switch (type) {
    case 'set_priority': return { type: 'set_priority', value: 'high' };
    case 'set_status': return { type: 'set_status', value: 'in_progress' };
    case 'add_tag': return { type: 'add_tag', value: 'auto' };
    case 'remove_tag': return { type: 'remove_tag', value: 'auto' };
    case 'assign_queue': return { type: 'assign_queue', queueSlug: 'suporte' };
    case 'assign_user': return { type: 'assign_user', email: '' };
    case 'assign_round_robin': return { type: 'assign_round_robin', balanceByWorkload: true };
    case 'add_internal_note': return { type: 'add_internal_note', body: 'Macro aplicada.' };
    case 'add_alert': return { type: 'add_alert', variant: 'info', message: '' };
  }
}

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

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
