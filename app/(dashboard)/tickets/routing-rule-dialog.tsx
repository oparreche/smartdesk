'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { createRoutingRuleFromTicketAction, createIgnoreRuleFromTicketAction } from './actions';

export type QueueOption = { slug: string; name: string };
export type AgentOption = { email: string; name: string | null };

const EVENT = 'smartdesk:open-routing-rule';

type EventDetail = {
  ticketId: string;
  requesterName: string | null;
  email: string | null;
  phone: string | null;
};

type ActionType = 'assign_queue' | 'assign_user' | 'set_priority' | 'add_tag' | 'ignore';

const PRIORITIES: Array<{ value: string; label: string }> = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
  { value: 'critical', label: 'Crítica' },
];

/**
 * Botão por ticket (lista/kanban). Dispara um evento global com os dados do
 * solicitante; o `RoutingRuleDialog` (montado uma vez na página) abre o modal.
 * Não renderiza nada se o solicitante não tiver email nem telefone.
 */
export function RoutingRuleButton({
  ticketId,
  requesterName,
  email,
  phone,
  variant = 'icon',
}: {
  ticketId: string;
  requesterName: string | null;
  email: string | null;
  phone: string | null;
  variant?: 'icon' | 'card';
}) {
  if (!email && !phone) return null;

  function open(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent<EventDetail>(EVENT, {
        detail: { ticketId, requesterName, email, phone },
      }),
    );
  }

  if (variant === 'card') {
    return (
      <button
        type="button"
        onClick={open}
        title="Criar regra de roteamento para este solicitante"
        className="rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[0.625rem] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
      >
        ⤳ rotear
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      title="Criar regra de roteamento para este solicitante"
      aria-label="Criar regra de roteamento"
      className="rounded-sm px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      ⤳
    </button>
  );
}

/**
 * Modal único da página. Escuta o evento e cria a regra de roteamento.
 */
export function RoutingRuleDialog({
  queues,
  agents,
}: {
  queues: QueueOption[];
  agents: AgentOption[];
}) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [matchBy, setMatchBy] = useState<'email' | 'phone'>('email');
  const [actionType, setActionType] = useState<ActionType>('assign_queue');
  const [queueSlug, setQueueSlug] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [priority, setPriority] = useState('high');
  const [tag, setTag] = useState('');
  const [ignoreScope, setIgnoreScope] = useState<'email' | 'domain'>('email');
  const [stopAfter, setStopAfter] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { kind: 'routing'; ruleId: string; matchValue: string }
    | { kind: 'ignore'; pattern: string }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const d = (e as CustomEvent<EventDetail>).detail;
      setDetail(d);
      setMatchBy(d.email ? 'email' : 'phone');
      setActionType('assign_queue');
      setQueueSlug(queues[0]?.slug ?? '');
      setAssigneeEmail(agents[0]?.email ?? '');
      setPriority('high');
      setTag('');
      setIgnoreScope('email');
      setStopAfter(false);
      setResult(null);
      setError(null);
    }
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, [queues, agents]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDetail(null);
    }
    if (detail) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  if (!detail) return null;

  function close() {
    setDetail(null);
  }

  function submit() {
    if (!detail) return;
    setError(null);

    // Ignorar (não mapear): cria EmailRoutingRule, não AutomationRule.
    if (actionType === 'ignore') {
      const d = detail;
      startTransition(async () => {
        const r = await createIgnoreRuleFromTicketAction({ ticketId: d.ticketId, scope: ignoreScope });
        if (r.ok) setResult({ kind: 'ignore', pattern: r.pattern });
        else setError(r.error);
      });
      return;
    }

    let action;
    if (actionType === 'assign_queue') {
      if (!queueSlug) return setError('Escolha uma fila.');
      action = { type: 'assign_queue' as const, queueSlug };
    } else if (actionType === 'assign_user') {
      if (!assigneeEmail) return setError('Escolha um agente.');
      action = { type: 'assign_user' as const, email: assigneeEmail };
    } else if (actionType === 'set_priority') {
      action = { type: 'set_priority' as const, value: priority as 'low' | 'normal' | 'high' | 'urgent' | 'critical' };
    } else {
      const t = tag.trim();
      if (!t) return setError('Informe a tag.');
      action = { type: 'add_tag' as const, value: t };
    }

    startTransition(async () => {
      const r = await createRoutingRuleFromTicketAction({
        ticketId: detail.ticketId,
        matchBy,
        action,
        stopAfterMatch: stopAfter,
      });
      if (r.ok) {
        setResult({ kind: 'routing', ruleId: r.ruleId, matchValue: r.matchValue });
      } else {
        setError(r.error);
      }
    });
  }

  const matchValue = matchBy === 'email' ? detail.email : detail.phone;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Criar regra de roteamento"
        className="w-full max-w-md rounded-md border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <p className="divider-eyebrow text-muted-foreground">Automação</p>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight">
              Regra de roteamento
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar"
            className="rounded-sm px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </header>

        {result ? (
          <div className="flex flex-col gap-4 px-5 py-6">
            {result.kind === 'routing' ? (
              <>
                <p className="text-sm text-foreground">
                  ✓ Regra criada — novos tickets de{' '}
                  <span className="font-medium">{result.matchValue}</span> serão roteados automaticamente.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-sm border border-border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    Fechar
                  </button>
                  <Link
                    href={`/rules/${result.ruleId}`}
                    className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:shadow-md"
                  >
                    Ajustar regra →
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-foreground">
                  ✓ Regra criada — emails de{' '}
                  <span className="font-mono font-medium">{result.pattern}</span> não criarão tickets
                  (Gmail e IMAP).
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-sm border border-border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    Fechar
                  </button>
                  <Link
                    href="/settings/gmail"
                    className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:shadow-md"
                  >
                    Ver regras de email →
                  </Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 py-4">
            {actionType === 'ignore' ? (
              <p className="text-sm text-muted-foreground">
                Impede que <span className="text-foreground">novos emails</span> deste remetente virem
                tickets (aplicado na entrada do Gmail/IMAP).
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aplica automaticamente a <span className="text-foreground">novos tickets</span> de{' '}
                <span className="font-medium text-foreground">
                  {detail.requesterName || matchValue || 'este solicitante'}
                </span>
                .
              </p>
            )}

            {/* Casar por (só para roteamento positivo) */}
            {actionType !== 'ignore' ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Identificar pelo</label>
                <div className="inline-flex rounded-sm border border-border p-0.5">
                  <MatchTab
                    active={matchBy === 'email'}
                    disabled={!detail.email}
                    onClick={() => setMatchBy('email')}
                    label="Email"
                    value={detail.email}
                  />
                  <MatchTab
                    active={matchBy === 'phone'}
                    disabled={!detail.phone}
                    onClick={() => setMatchBy('phone')}
                    label="Telefone"
                    value={detail.phone}
                  />
                </div>
              </div>
            ) : null}

            {/* Ação */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Ação</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
                className="rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              >
                <option value="assign_queue">Atribuir à fila</option>
                <option value="assign_user">Atribuir a agente</option>
                <option value="set_priority">Definir prioridade</option>
                <option value="add_tag">Adicionar tag</option>
                {detail.email ? (
                  <option value="ignore">Não criar ticket (ignorar remetente)</option>
                ) : null}
              </select>
            </div>

            {/* Parâmetro da ação */}
            {actionType === 'assign_queue' && (
              <SelectField label="Fila" value={queueSlug} onChange={setQueueSlug}>
                {queues.length === 0 ? (
                  <option value="">Nenhuma fila cadastrada</option>
                ) : (
                  queues.map((q) => (
                    <option key={q.slug} value={q.slug}>{q.name}</option>
                  ))
                )}
              </SelectField>
            )}
            {actionType === 'assign_user' && (
              <SelectField label="Agente" value={assigneeEmail} onChange={setAssigneeEmail}>
                {agents.length === 0 ? (
                  <option value="">Nenhum agente ativo</option>
                ) : (
                  agents.map((a) => (
                    <option key={a.email} value={a.email}>{a.name || a.email}</option>
                  ))
                )}
              </SelectField>
            )}
            {actionType === 'set_priority' && (
              <SelectField label="Prioridade" value={priority} onChange={setPriority}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </SelectField>
            )}
            {actionType === 'add_tag' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tag</label>
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="ex: cliente-vip"
                  className="rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                />
              </div>
            )}
            {actionType === 'ignore' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">O que ignorar</label>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm">
                    <input
                      type="radio"
                      name="ignoreScope"
                      checked={ignoreScope === 'email'}
                      onChange={() => setIgnoreScope('email')}
                    />
                    <span>
                      Só este email <span className="font-mono text-xs text-muted-foreground">{detail.email}</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm">
                    <input
                      type="radio"
                      name="ignoreScope"
                      checked={ignoreScope === 'domain'}
                      onChange={() => setIgnoreScope('domain')}
                    />
                    <span>
                      Todo o domínio{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        *@{detail.email?.split('@')[1] ?? '…'}
                      </span>
                    </span>
                  </label>
                </div>
                <p className="text-[0.6875rem] text-muted-foreground">
                  Emails que casarem serão descartados na entrada — não criam nem reabrem tickets.
                </p>
              </div>
            )}

            {actionType !== 'ignore' ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={stopAfter}
                  onChange={(e) => setStopAfter(e.target.checked)}
                />
                Parar de avaliar outras regras após aplicar
              </label>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive">
                ⚠ {error}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={close}
                className="rounded-sm border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
              >
                {pending ? 'Criando…' : 'Criar regra'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MatchTab({
  active,
  disabled,
  onClick,
  label,
  value,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  value: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex flex-1 flex-col items-start rounded-sm px-2.5 py-1.5 text-left transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
        disabled ? 'cursor-not-allowed opacity-40' : '',
      ].join(' ')}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className={`truncate text-[0.625rem] ${active ? 'text-primary-foreground/80' : ''}`}>
        {value || '—'}
      </span>
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
      >
        {children}
      </select>
    </div>
  );
}
