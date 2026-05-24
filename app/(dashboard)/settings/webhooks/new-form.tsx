'use client';

import { useActionState, useState } from 'react';
import { createWebhookAction, type WebhookState } from './actions';

const initial: WebhookState = undefined;

export function NewWebhookForm({ events }: { events: readonly string[] }) {
  const [state, formAction, pending] = useActionState(createWebhookAction, initial);
  const [showForm, setShowForm] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 1500);
  }

  // Mostra o secret apenas uma vez após criar
  if (state?.ok && state.secret) {
    return (
      <section className="card flex flex-col gap-4 p-5">
        <header>
          <p className="divider-eyebrow text-success">✓ Webhook criado</p>
          <h2 className="mt-2 font-display text-base font-medium tracking-tight">
            Salve o secret agora — não será exibido de novo
          </h2>
        </header>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={state.secret}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 rounded-sm border border-border bg-surface-raised px-3 py-2 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => copy(state.secret)}
            className="rounded-sm border border-border bg-surface px-3 py-1.5 text-xs hover:bg-muted"
          >
            {copiedSecret ? '✓ copiado' : 'Copiar'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm(false);
            window.location.reload();
          }}
          className="self-end rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm"
        >
          Entendi
        </button>
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="divider-eyebrow text-muted-foreground">
            <span className="numeral-serif text-[0.6875rem] text-primary">01</span>
            <span className="mx-1.5 opacity-40">·</span>
            Adicionar endpoint
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-md"
          >
            ＋ Novo webhook
          </button>
        ) : null}
      </header>

      {showForm ? (
        <form action={formAction} className="flex flex-col gap-3 rounded-sm border border-border bg-surface-raised p-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground-secondary">Nome</span>
            <input
              name="name"
              required
              maxLength={120}
              placeholder="Slack incidente / Zapier integração"
              className="rounded-sm border border-border bg-surface px-2.5 py-1.5 text-sm shadow-xs outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground-secondary">URL</span>
            <input
              name="url"
              type="url"
              required
              maxLength={500}
              placeholder="https://hooks.zapier.com/..."
              className="rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-[0.8125rem] shadow-xs outline-none focus:border-primary"
            />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium text-foreground-secondary">
              Eventos
            </legend>
            <div className="grid grid-cols-2 gap-1">
              {events.map((ev) => (
                <label
                  key={ev}
                  className="flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-1 text-xs hover:bg-muted/40"
                >
                  <input type="checkbox" name="events" value={ev} />
                  <code className="font-mono text-[0.6875rem]">{ev}</code>
                </label>
              ))}
            </div>
          </fieldset>

          {state && !state.ok ? (
            <p className="rounded-sm border border-destructive/30 bg-destructive-soft px-2 py-1 text-xs text-destructive">
              ⚠ {state.error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-sm border border-border bg-surface px-3 py-1 text-xs hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
            >
              {pending ? 'Criando…' : 'Criar webhook'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
