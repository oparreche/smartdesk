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
    <section className="flex flex-col gap-3 rounded-md border border-border p-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Testar integração
      </h2>
      <p className="text-xs text-muted-foreground">
        Executa em modo dry-run (não persiste enriquecimento, mas registra run em histórico).
        Informe um ticket de exemplo para resolver as variáveis <code>{'{{ticket.*}}'}</code>.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Ticket de exemplo (opcional)</span>
          <input
            value={ticketCode}
            onChange={(e) => setTicketCode(e.target.value.toUpperCase())}
            placeholder="HELP-100001"
            className="w-40 rounded-md border border-border px-2.5 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <button
          type="button"
          onClick={runTest}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? 'Executando…' : 'Testar agora'}
        </button>
      </div>

      {error ? (
        <pre className="overflow-auto rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </pre>
      ) : null}

      {result ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Requisição">
            <KV label="Método" value={result.requestMethod} />
            <KV label="URL" value={result.requestUrl} mono />
            <Details label="Headers">
              <pre className="text-xs">{JSON.stringify(result.requestHeaders, null, 2)}</pre>
            </Details>
            {result.requestBody ? (
              <Details label="Body">
                <pre className="text-xs">{JSON.stringify(result.requestBody, null, 2)}</pre>
              </Details>
            ) : null}
          </Card>

          <Card title="Resposta">
            <KV label="Status" value={String(result.responseStatus ?? '—')} />
            <KV label="Duração" value={`${result.durationMs}ms`} />
            <KV label="Final status" value={result.status} />
            {result.errorMessage ? <KV label="Erro" value={result.errorMessage} mono /> : null}
            <Details label="Body" defaultOpen>
              <pre className="max-h-72 overflow-auto text-xs">{JSON.stringify(result.responseBody, null, 2)}</pre>
            </Details>
          </Card>

          <Card title="Dados mapeados (enrichment)">
            <pre className="max-h-72 overflow-auto rounded-md bg-muted/30 p-3 text-xs">
              {result.mappedData ? JSON.stringify(result.mappedData, null, 2) : '—'}
            </pre>
          </Card>
        </div>
      ) : null}
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <p className="text-xs">
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className={mono ? 'break-all font-mono' : ''}>{value}</span>
    </p>
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
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}
