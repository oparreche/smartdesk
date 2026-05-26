'use client';

import { useState, useTransition } from 'react';

type TestResult = {
  status: string;
  requestUrl: string;
  requestMethod: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseStatus: number | null;
  responseBody: unknown;
  mappedData: unknown;
  errorMessage: string | null;
  durationMs: number;
};

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

export function TestPanel({ integrationId }: { integrationId: string }) {
  const [ticketCode, setTicketCode] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function runTest() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/integrations/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ integrationId, ticketCode: ticketCode || undefined }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? data.error ?? 'Falha desconhecida');
        } else {
          setResult(data);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <header>
        <p className="divider-eyebrow text-muted-foreground">Testar integração</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Executa em modo <span className="font-medium text-foreground">dry-run</span> (não persiste
          enriquecimento, mas registra a run no histórico). Informe um ticket de exemplo para resolver
          as variáveis <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">{'{{ticket.*}}'}</code>.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">Ticket de exemplo (opcional)</span>
          <input
            value={ticketCode}
            onChange={(e) => setTicketCode(e.target.value.toUpperCase())}
            placeholder="HELP-100001"
            className={`${inputClass} w-44 font-mono`}
          />
        </label>
        <button
          type="button"
          onClick={runTest}
          disabled={pending}
          className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
        >
          {pending ? 'Executando…' : 'Testar agora'}
        </button>
      </div>

      {error ? (
        <pre className="overflow-auto rounded-sm border border-destructive/30 bg-destructive-soft p-3 text-xs text-destructive">
          ⚠ {error}
        </pre>
      ) : null}

      {result ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Requisição">
            <KV label="Método" value={result.requestMethod} />
            <KV label="URL" value={result.requestUrl} mono />
            <Details label="Headers">
              <Code>{JSON.stringify(result.requestHeaders, null, 2)}</Code>
            </Details>
            {result.requestBody ? (
              <Details label="Body">
                <Code>{JSON.stringify(result.requestBody, null, 2)}</Code>
              </Details>
            ) : null}
          </Card>

          <Card title="Resposta">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill status={result.responseStatus} />
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
                {result.durationMs}ms
              </span>
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
                {result.status}
              </span>
            </div>
            {result.errorMessage ? <KV label="Erro" value={result.errorMessage} mono /> : null}
            <Details label="Body" defaultOpen>
              <Code className="max-h-72">{JSON.stringify(result.responseBody, null, 2)}</Code>
            </Details>
          </Card>

          <Card title="Dados mapeados (enrichment)">
            <Code className="max-h-72">
              {result.mappedData ? JSON.stringify(result.mappedData, null, 2) : '—'}
            </Code>
          </Card>
        </div>
      ) : null}
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface-raised p-3 shadow-xs">
      <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <p className="text-xs">
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className={mono ? 'break-all font-mono text-foreground-secondary' : 'text-foreground'}>{value}</span>
    </p>
  );
}

function StatusPill({ status }: { status: number | null }) {
  if (status === null) return <span className="pill bg-muted text-muted-foreground">sem resposta</span>;
  const ok = status >= 200 && status < 300;
  return (
    <span className={`pill ${ok ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive'}`}>
      HTTP {status}
    </span>
  );
}

function Code({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <pre className={`overflow-auto rounded-sm border border-border-subtle bg-surface-sunken p-2.5 font-mono text-[0.6875rem] leading-relaxed ${className}`}>
      {children}
    </pre>
  );
}

function Details({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen}>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
}
