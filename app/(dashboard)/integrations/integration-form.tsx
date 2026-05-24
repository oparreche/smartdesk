'use client';

import { useState, useActionState } from 'react';
import { createIntegrationAction, updateIntegrationAction, type FormState } from './actions';
import type { IntegrationView } from '@/src/services/integrations/crud';

type Props = {
  mode: 'create' | 'edit';
  initial?: IntegrationView;
};

const TRIGGERS: { value: string; label: string; description: string; iconClass: string; icon: string }[] = [
  {
    value: 'ticket.created',
    label: 'Ticket criado',
    description: 'Roda assim que um ticket nasce (qualquer origem).',
    iconClass: 'bg-info-soft text-info',
    icon: '＋',
  },
  {
    value: 'form.submitted',
    label: 'Formulário enviado',
    description: 'Roda ao receber submissão de form público.',
    iconClass: 'bg-success-soft text-success',
    icon: '⬚',
  },
  {
    value: 'manual.run',
    label: 'Manual',
    description: 'Executada apenas pelo botão "executar agora".',
    iconClass: 'bg-warning-soft text-warning',
    icon: '▶',
  },
];

const METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

const AUTH_TYPES: { value: string; label: string; helper: string }[] = [
  { value: 'none', label: 'Nenhuma', helper: 'Endpoint público' },
  { value: 'bearer', label: 'Bearer token', helper: 'Authorization: Bearer …' },
  { value: 'api_key_header', label: 'API key (header)', helper: 'Header customizado' },
  { value: 'api_key_query', label: 'API key (query)', helper: 'Param na URL' },
  { value: 'basic', label: 'Basic auth', helper: 'username + password' },
  { value: 'custom_headers', label: 'Headers customizados', helper: 'JSON livre de headers' },
];

const initial: FormState | undefined = undefined;

export function IntegrationForm({ mode, initial: i }: Props) {
  const [state, formAction, pending] = useActionState(createIntegrationAction, initial);

  if (mode === 'edit' && i) {
    return (
      <FormBody
        action={async (fd) => {
          fd.set('id', i.id);
          await updateIntegrationAction(fd);
        }}
        i={i}
        pending={false}
        error={null}
        submitLabel="Salvar alterações"
      />
    );
  }

  return (
    <FormBody
      action={formAction}
      i={i}
      pending={pending}
      error={state && 'ok' in state && !state.ok ? state.error : null}
      submitLabel={pending ? 'Criando…' : 'Criar integração'}
    />
  );
}

function FormBody({
  action,
  i,
  pending,
  error,
  submitLabel,
}: {
  action: (fd: FormData) => void | Promise<void>;
  i: IntegrationView | undefined;
  pending: boolean;
  error: string | null;
  submitLabel: string;
}) {
  const [authType, setAuthType] = useState<string>(i?.authType ?? 'none');
  const [requestTab, setRequestTab] = useState<'headers' | 'query' | 'body'>('headers');

  return (
    <form action={action} className="flex flex-col gap-8 pb-24">
      {/* 01 — Identidade */}
      <Section number="01" title="Identidade" description="Nome interno e quando esta integração executa.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
          <Field label="Nome *">
            <input
              name="name"
              defaultValue={i?.name}
              required
              maxLength={120}
              placeholder="ex.: API de Parceiros"
              autoFocus={!i}
              className={inputClass}
            />
          </Field>
          <Field label="Ordem de execução">
            <input
              name="runOrder"
              type="number"
              min={0}
              max={1000}
              defaultValue={i?.runOrder ?? 0}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Descrição">
          <input
            name="description"
            defaultValue={i?.description ?? ''}
            maxLength={500}
            placeholder="O que esta integração faz?"
            className={inputClass}
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface-sunken/60 px-3 py-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={i?.enabled ?? true}
            className="h-4 w-4 accent-primary"
          />
          <span className="font-medium">Integração ativa</span>
          <span className="text-xs text-muted-foreground">— se desligar, eventos não disparam execução</span>
        </label>
      </Section>

      {/* 02 — Triggers */}
      <Section number="02" title="Quando rodar" description="Marque os eventos que disparam essa integração.">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {TRIGGERS.map((t) => (
            <label
              key={t.value}
              className="group flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 transition-all hover:border-border-strong hover:shadow-xs has-[:checked]:border-primary has-[:checked]:bg-primary-soft/50 has-[:checked]:shadow-sm"
            >
              <input
                type="checkbox"
                name="triggerEvents"
                value={t.value}
                defaultChecked={i?.triggerEvents.includes(t.value)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm font-display text-base ${t.iconClass}`}>
                {t.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.label}</p>
                <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">{t.description}</p>
              </div>
            </label>
          ))}
        </div>
      </Section>

      {/* 03 — Requisição */}
      <Section number="03" title="Requisição" description="Endpoint HTTP que será chamado. Use {{variáveis}} no URL/body.">
        {/* Method + URL line */}
        <div className="flex flex-col gap-2">
          <span className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            Endpoint
          </span>
          <div className="flex overflow-hidden rounded-sm border border-border bg-surface-raised shadow-xs focus-within:border-primary">
            <MethodSelect name="method" defaultValue={i?.method ?? 'GET'} />
            <input
              name="url"
              defaultValue={i?.url}
              required
              placeholder="https://api.suaempresa.com/v1/partners?email={{ticket.requester.email}}"
              className="flex-1 border-0 bg-transparent px-3 py-2.5 font-mono text-sm outline-none"
            />
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            Suporta <code className="font-mono text-foreground">{'{{ticket.requester.email}}'}</code>,{' '}
            <code className="font-mono text-foreground">{'{{ticket.requester.phone}}'}</code>,{' '}
            <code className="font-mono text-foreground">{'{{ticket.requester.document}}'}</code> e custom fields.
          </p>
        </div>

        {/* Tabs: Headers | Query | Body */}
        <div className="rounded-sm border border-border bg-surface-raised">
          <div className="flex border-b border-border bg-surface-sunken/60">
            <TabButton active={requestTab === 'headers'} onClick={() => setRequestTab('headers')}>
              Headers
            </TabButton>
            <TabButton active={requestTab === 'query'} onClick={() => setRequestTab('query')}>
              Query params
            </TabButton>
            <TabButton active={requestTab === 'body'} onClick={() => setRequestTab('body')}>
              Body
            </TabButton>
          </div>
          <div className="p-3">
            <textarea
              name="headersJson"
              rows={5}
              defaultValue={
                i?.headers && Object.keys(i.headers).length
                  ? JSON.stringify(i.headers, null, 2)
                  : ''
              }
              placeholder='{ "Accept": "application/json" }'
              className={`${textareaClass} ${requestTab === 'headers' ? '' : 'hidden'}`}
            />
            <textarea
              name="queryParamsJson"
              rows={5}
              defaultValue={
                i?.queryParams && Object.keys(i.queryParams).length
                  ? JSON.stringify(i.queryParams, null, 2)
                  : ''
              }
              placeholder='{ "lang": "pt-br" }'
              className={`${textareaClass} ${requestTab === 'query' ? '' : 'hidden'}`}
            />
            <textarea
              name="bodyJson"
              rows={8}
              defaultValue={i?.bodyTemplate ? JSON.stringify(i.bodyTemplate, null, 2) : ''}
              placeholder='{"email": "{{ticket.requester.email}}"}'
              className={`${textareaClass} ${requestTab === 'body' ? '' : 'hidden'}`}
            />
            <p className="mt-2 text-[0.6875rem] text-muted-foreground">
              JSON puro. Use <code className="font-mono">{'{{vars}}'}</code> em qualquer valor string.
            </p>
          </div>
        </div>

        {/* Timeout + Retries */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Timeout (ms)">
            <input
              name="timeoutMs"
              type="number"
              min={1000}
              max={30000}
              defaultValue={i?.timeoutMs ?? 10000}
              className={inputClass}
            />
          </Field>
          <Field label="Máximo de retentativas">
            <input
              name="maxRetries"
              type="number"
              min={0}
              max={5}
              defaultValue={i?.maxRetries ?? 2}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      {/* 04 — Autenticação */}
      <Section number="04" title="Autenticação" description="Como provar identidade ao endpoint.">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {AUTH_TYPES.map((a) => (
            <label
              key={a.value}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface p-3 transition-all hover:border-border-strong has-[:checked]:border-primary has-[:checked]:bg-primary-soft/50"
            >
              <input
                type="radio"
                name="authType"
                value={a.value}
                checked={authType === a.value}
                onChange={(e) => setAuthType(e.target.value)}
                className="mt-1 h-3.5 w-3.5 accent-primary"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium">{a.label}</p>
                <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{a.helper}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Auth-specific fields */}
        {authType !== 'none' ? (
          <div className="rounded-md border border-border bg-surface p-4">
            {authType === 'api_key_header' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]">
                <Field label="Header name">
                  <input
                    name="authHeaderName"
                    defaultValue={i?.authSummary.type === 'api_key_header' ? i.authSummary.headerName : 'X-API-Key'}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
                <Field label={i ? 'Valor (deixe em branco pra manter)' : 'Valor'}>
                  <input
                    name="authValue"
                    type="password"
                    placeholder={i?.authSummary.type === 'api_key_header' ? `••• ${i.authSummary.valueLast4}` : ''}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
              </div>
            )}

            {authType === 'api_key_query' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]">
                <Field label="Param name">
                  <input
                    name="authParamName"
                    defaultValue={i?.authSummary.type === 'api_key_query' ? i.authSummary.paramName : 'api_key'}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
                <Field label={i ? 'Valor (deixe em branco pra manter)' : 'Valor'}>
                  <input
                    name="authValue"
                    type="password"
                    placeholder={i?.authSummary.type === 'api_key_query' ? `••• ${i.authSummary.valueLast4}` : ''}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
              </div>
            )}

            {authType === 'bearer' && (
              <Field label={i ? 'Token (deixe em branco pra manter)' : 'Token'}>
                <input
                  name="authToken"
                  type="password"
                  placeholder={i?.authSummary.type === 'bearer' ? `••• ${i.authSummary.tokenLast4}` : 'eyJhbGciOi…'}
                  className={`${inputClass} font-mono`}
                />
              </Field>
            )}

            {authType === 'basic' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]">
                <Field label="Username">
                  <input
                    name="authUsername"
                    defaultValue={i?.authSummary.type === 'basic' ? i.authSummary.username : ''}
                    className={inputClass}
                  />
                </Field>
                <Field label={i ? 'Password (deixe em branco pra manter)' : 'Password'}>
                  <input name="authPassword" type="password" className={inputClass} />
                </Field>
              </div>
            )}

            {authType === 'custom_headers' && (
              <Field label="Headers customizados (JSON)">
                <textarea
                  name="authCustomHeaders"
                  rows={4}
                  placeholder='{ "X-Org": "acme", "X-Trace": "..." }'
                  className={textareaClass}
                />
              </Field>
            )}
          </div>
        ) : null}
      </Section>

      {/* 05 — Mapeamento */}
      <Section
        number="05"
        title="Mapeamento da resposta"
        description="Pra cada chave, defina o JSONPath que extrai o valor da resposta."
      >
        <MappingEditor
          name="responseMappingJson"
          initial={i?.responseMapping ?? { 'partner.id': '$.data.id', 'partner.name': '$.data.name' }}
        />
        <Field label="Campo obrigatório de match (opcional)">
          <input
            name="requiredMatchField"
            defaultValue={i?.requiredMatchField ?? ''}
            placeholder="partner.id"
            className={`${inputClass} font-mono`}
          />
          <Helper>
            Se a API retornar 200 mas este campo (ex.{' '}
            <code className="font-mono">partner.id</code>) vier vazio, a execução é marcada{' '}
            <strong>skipped</strong> e nada é salvo. Protege contra APIs que devolvem stub genérico em vez de 404.
          </Helper>
        </Field>
        <Field label="Política de falha">
          <select name="failurePolicy" defaultValue={i?.failurePolicy ?? 'skip'} className={selectClass}>
            <option value="skip">Ignorar (registra log)</option>
            <option value="retry_later">Agendar retry</option>
            <option value="flag_ticket">Adicionar alerta no ticket</option>
          </select>
        </Field>
      </Section>

      {error ? (
        <p className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {/* Sticky footer */}
      <div className="sticky bottom-0 -mx-8 -mb-8 mt-4 border-t border-border bg-surface/95 px-8 py-3 backdrop-blur">
        <div className="flex items-center justify-end gap-3">
          <p className="text-xs text-muted-foreground">
            {i ? 'Editando integração existente' : 'Criar nova integração'}
          </p>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
          >
            {submitLabel}
            <span aria-hidden className="font-mono text-xs">↵</span>
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Helpers de UI ─────────────────────────────────────────────

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

const selectClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none focus:border-primary';

const textareaClass =
  'w-full rounded-sm border border-border bg-surface-raised px-3 py-2 font-mono text-xs leading-relaxed shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

function Section({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-5 md:grid-cols-[160px_1fr]">
      <header className="flex flex-col gap-1 md:sticky md:top-4 md:self-start">
        <span className="numeral-serif text-[0.875rem] text-primary">{number}</span>
        <h2 className="font-display text-lg font-semibold leading-tight tracking-tight">{title}</h2>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5 shadow-xs">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className ?? ''}`}>
      <span className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return <span className="text-[0.6875rem] leading-relaxed text-muted-foreground">{children}</span>;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative border-r border-border px-4 py-2 text-xs font-medium transition-colors ${
        active
          ? 'bg-surface-raised text-foreground'
          : 'text-muted-foreground hover:bg-surface-raised/40 hover:text-foreground'
      }`}
    >
      {children}
      {active ? <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 bg-primary" /> : null}
    </button>
  );
}

function MethodSelect({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState<string>(defaultValue);
  const color: Record<string, string> = {
    GET: 'bg-info-soft text-info',
    POST: 'bg-success-soft text-success',
    PUT: 'bg-warning-soft text-warning',
    PATCH: 'bg-primary-soft text-primary',
  };
  return (
    <div className="relative flex border-r border-border">
      <span
        className={`flex shrink-0 items-center px-3 py-2.5 font-mono text-xs font-semibold ${color[value] ?? ''}`}
      >
        {value}
      </span>
      <select
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none border-0 bg-transparent pl-3 pr-1 text-xs opacity-0"
      >
        {METHODS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Mapping editor visual ────────────────────────────────────

function MappingEditor({
  name,
  initial,
}: {
  name: string;
  initial: Record<string, string>;
}) {
  const initialRows = Object.entries(initial).map(([alias, path]) => ({ alias, path }));
  if (initialRows.length === 0) {
    initialRows.push({ alias: '', path: '' });
  }
  const [rows, setRows] = useState<{ alias: string; path: string }[]>(initialRows);

  function update(i: number, field: 'alias' | 'path', value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function add() {
    setRows((prev) => [...prev, { alias: '', path: '' }]);
  }

  function remove(i: number) {
    setRows((prev) => (prev.length === 1 ? [{ alias: '', path: '' }] : prev.filter((_, idx) => idx !== i)));
  }

  const serialized = JSON.stringify(
    Object.fromEntries(rows.filter((r) => r.alias.trim() && r.path.trim()).map((r) => [r.alias.trim(), r.path.trim()])),
  );

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={serialized} />
      <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2 text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
        <span className="px-2">Chave (alias)</span>
        <span className="px-2">JSONPath</span>
        <span></span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
            <input
              value={row.alias}
              onChange={(e) => update(i, 'alias', e.target.value)}
              placeholder="partner.name"
              className={`${inputClass} font-mono`}
            />
            <input
              value={row.path}
              onChange={(e) => update(i, 'path', e.target.value)}
              placeholder="$.data.name"
              className={`${inputClass} font-mono`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              title="Remover"
              className="flex h-9 w-9 items-center justify-center rounded-sm border border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="2 3 10 3" />
                <path d="M3.5 3v7a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V3" />
                <path d="M5 3V2a.5.5 0 0 1 .5-.5h1A.5.5 0 0 1 7 2v1" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-1 self-start rounded-sm border border-dashed border-border-strong px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
      >
        + Adicionar mapeamento
      </button>
      <Helper>
        <strong>Chave</strong>: nome interno (dot-paths viram árvore, ex. <code className="font-mono">partner.name</code>).
        {' '}<strong>JSONPath</strong>: caminho na resposta JSON (ex. <code className="font-mono">$.data.name</code>,{' '}
        <code className="font-mono">$[0].id</code>).
      </Helper>
    </div>
  );
}
