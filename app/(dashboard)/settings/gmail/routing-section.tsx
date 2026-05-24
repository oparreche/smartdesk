'use client';

import { useActionState, useState } from 'react';
import {
  createRoutingRuleAction,
  toggleRoutingRuleAction,
  deleteRoutingRuleAction,
  type RoutingState,
} from './routing-actions';

export type RoutingRule = {
  id: string;
  pattern: string;
  action: 'ignore' | 'tag';
  tagName: string | null;
  enabled: boolean;
  note: string | null;
  matchCount: number;
  lastMatchedAt: Date | null;
  createdAt: Date;
};

const initial: RoutingState = undefined;

export function RoutingSection({ rules }: { rules: RoutingRule[] }) {
  const [showForm, setShowForm] = useState(false);
  const [state, formAction, pending] = useActionState(createRoutingRuleAction, initial);
  const [action, setAction] = useState<'ignore' | 'tag'>('tag');

  // Fecha form quando criar com sucesso
  if (state && 'ok' in state && state.ok && showForm) {
    setTimeout(() => setShowForm(false), 0);
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="divider-eyebrow text-muted-foreground">
            <span className="numeral-serif text-[0.6875rem] text-primary">03</span>
            <span className="mx-1.5 opacity-40">·</span>
            Regras de roteamento
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Filtre emails recebidos por remetente — ignore marketing/spam ou
            aplique tags automáticas. Suporta glob{' '}
            <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">*</code>{' '}
            (ex: <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">*@99freelas.com.br</code>).
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-raised px-2.5 py-1 text-xs text-foreground-secondary hover:bg-muted hover:text-foreground"
          >
            <span aria-hidden>＋</span> Nova regra
          </button>
        ) : null}
      </header>

      {showForm ? (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-sm border border-border bg-surface-raised p-3"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
            <Field label="Pattern" hint="Email exato ou glob com *">
              <input
                name="pattern"
                required
                maxLength={255}
                placeholder="*@99freelas.com.br"
                className={`${inputClass} font-mono text-[0.8125rem]`}
              />
            </Field>
            <Field label="Ação">
              <div className="flex items-center gap-0.5 rounded-sm border border-border bg-surface p-0.5">
                <ActionBtn
                  active={action === 'tag'}
                  onClick={() => setAction('tag')}
                  variant="primary"
                >
                  🏷 Aplicar tag
                </ActionBtn>
                <ActionBtn
                  active={action === 'ignore'}
                  onClick={() => setAction('ignore')}
                  variant="destructive"
                >
                  🚫 Ignorar
                </ActionBtn>
              </div>
              <input type="hidden" name="action" value={action} />
            </Field>
          </div>

          {action === 'tag' ? (
            <Field label="Nome da tag" hint="Tag será criada automaticamente se não existir.">
              <input
                name="tagName"
                required={action === 'tag'}
                maxLength={60}
                placeholder="marketing"
                className={inputClass}
              />
            </Field>
          ) : null}

          <Field label="Nota (opcional)" hint="Pra você lembrar o motivo da regra.">
            <input
              name="note"
              maxLength={500}
              placeholder="ex: emails de notificação do 99Freelas"
              className={inputClass}
            />
          </Field>

          {state && !state.ok ? (
            <p className="rounded-sm border border-destructive/30 bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive">
              ⚠ {state.error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-foreground-secondary hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-sm bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
            >
              {pending ? 'Salvando…' : 'Criar regra'}
            </button>
          </div>
        </form>
      ) : null}

      {rules.length === 0 && !showForm ? (
        <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Nenhuma regra ainda. Crie uma pra começar a filtrar emails.
        </p>
      ) : null}

      {rules.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rules.map((r) => (
            <RuleRow key={r.id} rule={r} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RuleRow({ rule }: { rule: RoutingRule }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li
      className={`rounded-sm border p-3 transition-colors ${
        rule.enabled
          ? 'border-border bg-surface-raised'
          : 'border-border bg-muted/30 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <code className="font-mono text-sm font-medium text-foreground">{rule.pattern}</code>
            <span aria-hidden className="text-muted-foreground">→</span>
            {rule.action === 'tag' ? (
              <span className="pill bg-primary-soft text-primary">
                🏷 tag <span className="font-medium">{rule.tagName}</span>
              </span>
            ) : (
              <span className="pill bg-destructive-soft text-destructive">
                🚫 ignorar
              </span>
            )}
            {!rule.enabled ? (
              <span className="pill bg-muted text-muted-foreground">○ desativada</span>
            ) : null}
          </div>
          {rule.note ? (
            <p className="mt-1 text-xs italic text-muted-foreground">{rule.note}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
            <span>
              <span className="numeral-serif text-foreground">{rule.matchCount}</span> matches
            </span>
            {rule.lastMatchedAt ? (
              <span>
                último{' '}
                {new Intl.DateTimeFormat('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(rule.lastMatchedAt)}
              </span>
            ) : (
              <span>nunca acionou</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <form action={toggleRoutingRuleAction}>
            <input type="hidden" name="id" value={rule.id} />
            <input type="hidden" name="enabled" value={rule.enabled ? 'false' : 'true'} />
            <button
              type="submit"
              className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground"
              title={rule.enabled ? 'Desativar' : 'Ativar'}
            >
              {rule.enabled ? '⏸ pausar' : '▶ ativar'}
            </button>
          </form>

          {confirming ? (
            <form action={deleteRoutingRuleAction} className="flex items-center gap-1">
              <input type="hidden" name="id" value={rule.id} />
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted"
              >
                cancelar
              </button>
              <button
                type="submit"
                className="rounded-sm bg-destructive px-2 py-1 text-[0.6875rem] font-medium text-destructive-soft hover:shadow-sm"
              >
                excluir?
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
              title="Excluir"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ActionBtn({
  active,
  onClick,
  children,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant: 'primary' | 'destructive';
}) {
  const activeClass =
    variant === 'primary'
      ? 'bg-primary text-primary-foreground'
      : 'bg-destructive text-destructive-soft';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? activeClass : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

const inputClass =
  'rounded-sm border border-border bg-surface px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

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
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
