'use client';

import { useActionState, useState } from 'react';
import { createKeyAction, type KeyState } from './actions';

const initial: KeyState = undefined;

export function NewKeyForm({ scopes }: { scopes: readonly string[] }) {
  const [state, formAction, pending] = useActionState(createKeyAction, initial);
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (state?.ok) {
    return (
      <section className="card flex flex-col gap-4 p-5">
        <header>
          <p className="divider-eyebrow text-success">✓ Key criada</p>
          <h2 className="mt-2 font-display text-base font-medium tracking-tight">
            Salve a chave AGORA — não será exibida novamente
          </h2>
        </header>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={state.rawKey}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 rounded-sm border border-border bg-surface-raised px-3 py-2 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => copy(state.rawKey)}
            className="rounded-sm border border-border bg-surface px-3 py-1.5 text-xs hover:bg-muted"
          >
            {copied ? '✓ copiado' : 'Copiar'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="self-end rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Entendi
        </button>
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between gap-3">
        <p className="divider-eyebrow text-muted-foreground">
          <span className="numeral-serif text-[0.6875rem] text-primary">01</span>
          <span className="mx-1.5 opacity-40">·</span>
          Nova API key
        </p>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm"
          >
            ＋ Criar key
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
              placeholder="Zapier produção / Backend ERP"
              className="rounded-sm border border-border bg-surface px-2.5 py-1.5 text-sm shadow-xs outline-none focus:border-primary"
            />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium text-foreground-secondary">Scopes</legend>
            <div className="grid grid-cols-2 gap-1">
              {scopes.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-1 text-xs"
                >
                  <input type="checkbox" name="scopes" value={s} defaultChecked={s.endsWith(':read')} />
                  <code className="font-mono text-[0.6875rem]">{s}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground-secondary">
              Expira em <span className="text-muted-foreground">· dias, vazio = nunca</span>
            </span>
            <input
              name="expiresInDays"
              type="number"
              min={1}
              max={3650}
              placeholder="ex: 90"
              className="rounded-sm border border-border bg-surface px-2.5 py-1.5 text-sm shadow-xs outline-none focus:border-primary"
            />
          </label>

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
              className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-60"
            >
              {pending ? 'Criando…' : 'Criar key'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
