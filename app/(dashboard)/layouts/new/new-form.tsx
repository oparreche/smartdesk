'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createLayoutAction, type CreateState } from '../actions';

const initial: CreateState | undefined = undefined;

export function NewLayoutForm() {
  const [state, formAction, pending] = useActionState(createLayoutAction, initial);

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-6">
      <header>
        <p className="divider-eyebrow text-muted-foreground">Comece com o básico</p>
        <h2 className="mt-2 font-display text-xl font-medium tracking-tight">
          Dê um nome ao painel
        </h2>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">Nome</span>
        <input
          name="name"
          required
          maxLength={120}
          placeholder="ex: Atendimento padrão"
          autoFocus
          className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background"
        />
        <span className="text-[0.6875rem] text-muted-foreground">
          Use um nome descritivo — você pode ter vários painéis (ex: Suporte
          Premium, Triagem Inicial, Vendas).
        </span>
      </label>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <footer className="mt-2 flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
        <Link
          href="/layouts"
          className="rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground-secondary hover:bg-muted hover:text-foreground"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
        >
          {pending ? 'Criando…' : 'Criar e abrir editor'}
          <span aria-hidden className="font-mono text-xs">→</span>
        </button>
      </footer>
    </form>
  );
}
