'use client';

import { useState, useTransition } from 'react';

type Mode = 'idle' | 'summary' | 'suggest';

const COMPOSER_FILL_EVENT = 'smartdesk:composer-fill';

export function AiAssist({
  code,
  canSuggest,
  aiEnabled,
}: {
  code: string;
  canSuggest: boolean;
  aiEnabled: boolean;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const [summary, setSummary] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function runSummary() {
    setError(null);
    setMode('summary');
    startTransition(async () => {
      try {
        const res = await fetch(`/api/tickets/${code}/ai/summary`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          setError(translateError(res.status, data?.error));
          setSummary(null);
        } else {
          setSummary(data.summary);
        }
      } catch {
        setError('Falha de rede');
      }
    });
  }

  async function runSuggest() {
    setError(null);
    setMode('suggest');
    startTransition(async () => {
      try {
        const res = await fetch(`/api/tickets/${code}/ai/suggest-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: instruction.trim() || undefined }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(translateError(res.status, data?.error));
          setDraft(null);
        } else {
          setDraft(data.draft);
        }
      } catch {
        setError('Falha de rede');
      }
    });
  }

  function insertIntoComposer() {
    if (!draft) return;
    window.dispatchEvent(new CustomEvent(COMPOSER_FILL_EVENT, { detail: { text: draft } }));
  }

  if (!aiEnabled) {
    return (
      <div className="card p-4">
        <header className="mb-2 flex items-center gap-2">
          <SparkleIcon />
          <h3 className="font-display text-sm font-medium tracking-tight">Assistente IA</h3>
        </header>
        <p className="text-xs leading-relaxed text-muted-foreground">
          IA não configurada. Defina <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">GEMINI_API_KEY</code> no <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">.env</code> para habilitar resumo e sugestão de resposta.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <header className="mb-3 flex items-center gap-2">
        <SparkleIcon />
        <h3 className="font-display text-sm font-medium tracking-tight">Assistente IA</h3>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={runSummary}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-raised px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          Resumir ticket
        </button>
        {canSuggest ? (
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'suggest' ? 'idle' : 'suggest'))}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary-soft px-2.5 py-1 text-xs text-primary hover:border-primary disabled:opacity-50"
          >
            Sugerir resposta
          </button>
        ) : null}
      </div>

      {mode === 'suggest' ? (
        <div className="mt-3 flex flex-col gap-2 rounded-sm border border-border bg-surface-raised p-2.5">
          <label className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            Instrução (opcional)
          </label>
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="ex: pedir nota fiscal, ser mais formal…"
            maxLength={500}
            className="rounded-sm border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={runSuggest}
            disabled={pending}
            className="self-end rounded-sm bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
          >
            {pending ? 'Gerando…' : 'Gerar sugestão'}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-sm border border-destructive/30 bg-destructive-soft px-2 py-1.5 text-[0.6875rem] text-destructive">
          {error}
        </p>
      ) : null}

      {pending && !summary && !draft ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <SpinnerIcon /> Consultando Gemini…
        </div>
      ) : null}

      {summary && mode === 'summary' ? (
        <div className="mt-3 rounded-sm border border-border bg-surface-raised p-3">
          <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            Resumo
          </p>
          <div className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
            {summary}
          </div>
        </div>
      ) : null}

      {draft && mode === 'suggest' ? (
        <div className="mt-3 rounded-sm border border-primary/30 bg-primary-soft/50 p-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-primary">
              Rascunho sugerido
            </p>
            <button
              type="button"
              onClick={insertIntoComposer}
              className="rounded-sm bg-primary px-2 py-0.5 text-[0.6875rem] font-medium text-primary-foreground hover:shadow-sm"
            >
              Usar no composer →
            </button>
          </div>
          <div className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
            {draft}
          </div>
          <p className="mt-2 text-[0.6875rem] italic text-muted-foreground">
            Revise antes de enviar — IA pode errar.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function translateError(status: number, code?: string): string {
  if (status === 503 || code === 'ai_not_configured') return 'IA não configurada no servidor.';
  if (status === 429) return 'Muitas requisições. Tente novamente em alguns minutos.';
  if (status === 401) return 'Sessão expirada.';
  if (status === 403) return 'Sem permissão.';
  return 'Erro ao consultar IA.';
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary" aria-hidden>
      <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z" />
      <path d="M13 11l.7 1.6L15 13l-1.3.7L13 15l-.7-1.3L11 13l1.3-.7L13 11z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="animate-spin" aria-hidden>
      <circle cx="8" cy="8" r="6" opacity="0.3" />
      <path d="M14 8a6 6 0 0 1-6 6" />
    </svg>
  );
}
