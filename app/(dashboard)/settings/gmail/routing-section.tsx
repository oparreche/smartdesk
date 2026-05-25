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

  // Fecha o form quando criar com sucesso
  if (state && 'ok' in state && state.ok && showForm) {
    setTimeout(() => setShowForm(false), 0);
  }

  const ignoreRules = rules.filter((r) => r.action === 'ignore');
  const tagRules = rules.filter((r) => r.action === 'tag');
  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <section className="card flex flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Filtros de entrada</p>
          <h2 className="mt-1.5 font-display text-xl font-semibold tracking-tight">
            Regras de roteamento
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Filtre emails recebidos pelo remetente — <span className="text-foreground">ignore</span>{' '}
            marketing/spam ou <span className="text-foreground">aplique tags</span> automáticas. Vale
            para <span className="text-foreground">Gmail e IMAP</span>. Suporta glob{' '}
            <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">*</code> — ex.:{' '}
            <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">*@99freelas.com.br</code>.
          </p>
          {rules.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[0.6875rem]">
              <span className="pill bg-destructive-soft text-destructive">
                🚫 {ignoreRules.length} ignorando
              </span>
              <span className="pill bg-primary-soft text-primary">
                🏷 {tagRules.length} taggeando
              </span>
              <span className="text-muted-foreground">
                · {activeCount} de {rules.length} ativa{rules.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
        </div>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
          >
            <span aria-hidden>＋</span> Nova regra
          </button>
        ) : null}
      </header>

      {showForm ? (
        <form
          action={formAction}
          className="flex flex-col gap-4 rounded-sm border border-border bg-surface-raised p-4"
        >
          {/* Escolha da ação como cartões */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ActionCard
              active={action === 'tag'}
              onClick={() => setAction('tag')}
              icon="🏷"
              title="Aplicar tag"
              desc="O email vira ticket e recebe a tag."
              tone="primary"
            />
            <ActionCard
              active={action === 'ignore'}
              onClick={() => setAction('ignore')}
              icon="🚫"
              title="Ignorar"
              desc="O email é descartado — não cria ticket."
              tone="destructive"
            />
          </div>
          <input type="hidden" name="action" value={action} />

          <div className={`grid grid-cols-1 gap-3 ${action === 'tag' ? 'sm:grid-cols-2' : ''}`}>
            <Field label="Remetente (pattern)" hint="Email exato ou glob com *">
              <input
                name="pattern"
                required
                maxLength={255}
                placeholder="*@99freelas.com.br"
                className={`${inputClass} font-mono text-[0.8125rem]`}
              />
            </Field>
            {action === 'tag' ? (
              <Field label="Nome da tag" hint="Criada automaticamente se não existir.">
                <input
                  name="tagName"
                  required
                  maxLength={60}
                  placeholder="marketing"
                  className={inputClass}
                />
              </Field>
            ) : null}
          </div>

          <Field label="Nota (opcional)" hint="Pra você lembrar o motivo da regra.">
            <input
              name="note"
              maxLength={500}
              placeholder="ex: notificações automáticas do 99Freelas"
              className={inputClass}
            />
          </Field>

          {state && !state.ok ? (
            <p className="rounded-sm border border-destructive/30 bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive">
              ⚠ {state.error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-sm border border-border bg-surface px-3 py-1.5 text-sm text-foreground-secondary hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
            >
              {pending ? 'Salvando…' : 'Criar regra'}
            </button>
          </div>
        </form>
      ) : null}

      {rules.length === 0 && !showForm ? (
        <div className="flex flex-col items-center gap-2 rounded-sm border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <span className="text-2xl">📥</span>
          <p className="text-sm font-medium text-foreground">Nenhum filtro ainda</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Crie regras para descartar remetentes indesejados ou taggear automaticamente. Você
            também pode criar a partir de um ticket (botão <span className="font-mono">⤳</span>).
          </p>
        </div>
      ) : null}

      {ignoreRules.length > 0 ? (
        <RuleGroup title="Ignorados" hint="Descartados na entrada — não viram tickets" rules={ignoreRules} />
      ) : null}
      {tagRules.length > 0 ? (
        <RuleGroup title="Taggeados" hint="Viram tickets com a tag aplicada" rules={tagRules} />
      ) : null}
    </section>
  );
}

function RuleGroup({
  title,
  hint,
  rules,
}: {
  title: string;
  hint: string;
  rules: RoutingRule[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-secondary">{title}</h3>
        <span className="numeral-serif text-xs text-muted-foreground">{rules.length}</span>
        <span className="text-[0.6875rem] text-muted-foreground">· {hint}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {rules.map((r) => (
          <RuleRow key={r.id} rule={r} />
        ))}
      </ul>
    </div>
  );
}

function RuleRow({ rule }: { rule: RoutingRule }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li
      className={`rounded-sm border p-3 transition-colors ${
        rule.enabled ? 'border-border bg-surface-raised' : 'border-border-subtle bg-muted/30 opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-sm ${
                rule.action === 'ignore' ? 'bg-destructive-soft' : 'bg-primary-soft'
              }`}
            >
              {rule.action === 'ignore' ? '🚫' : '🏷'}
            </span>
            <code className="truncate font-mono text-sm font-medium text-foreground">{rule.pattern}</code>
            {rule.action === 'tag' ? (
              <span className="pill bg-primary-soft text-primary">
                → <span className="font-medium">{rule.tagName}</span>
              </span>
            ) : null}
            {!rule.enabled ? <span className="pill bg-muted text-muted-foreground">○ pausada</span> : null}
          </div>
          {rule.note ? <p className="mt-1 text-xs italic text-muted-foreground">{rule.note}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
            <span>
              <span className="numeral-serif text-foreground">{rule.matchCount}</span> match
              {rule.matchCount === 1 ? '' : 'es'}
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
                className="rounded-sm bg-destructive px-2 py-1 text-[0.6875rem] font-medium text-destructive-foreground hover:shadow-sm"
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

function ActionCard({
  active,
  onClick,
  icon,
  title,
  desc,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  desc: string;
  tone: 'primary' | 'destructive';
}) {
  const activeClass =
    tone === 'primary' ? 'border-primary bg-primary-soft/50' : 'border-destructive/50 bg-destructive-soft/50';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-start gap-2.5 rounded-sm border p-3 text-left transition-colors ${
        active ? activeClass : 'border-border bg-surface hover:bg-muted/40'
      }`}
    >
      <span aria-hidden className="text-lg leading-none">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {title}
          {active ? <span aria-hidden className="text-xs text-primary">✓</span> : null}
        </span>
        <span className="text-[0.6875rem] leading-snug text-muted-foreground">{desc}</span>
      </span>
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
