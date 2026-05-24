'use client';

import { useActionState } from 'react';
import { updateOrgNameAction, type OrgState } from './actions';

const initial: OrgState | undefined = undefined;

export function OrgNameForm({ initialName, disabled }: { initialName: string; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(updateOrgNameAction, initial);

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-5">
      <header>
        <p className="divider-eyebrow text-muted-foreground">
          <span className="numeral-serif text-[0.6875rem] text-primary">01</span>
          <span className="mx-1.5 opacity-40">·</span>
          Identidade
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Nome exibido em emails transacionais, portal do cliente e topo do app.
        </p>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">Nome da organização</span>
        <input
          name="name"
          defaultValue={initialName}
          required
          maxLength={160}
          disabled={disabled}
          className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background disabled:opacity-60"
        />
      </label>

      {state ? (
        state.ok ? (
          <p className="rounded-sm border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
            ✓ {state.message}
          </p>
        ) : (
          <p
            role="alert"
            className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
          >
            {state.error}
          </p>
        )
      ) : null}

      <footer className="flex items-center justify-end border-t border-border-subtle pt-3">
        <button
          type="submit"
          disabled={pending || disabled}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
        >
          {pending ? 'Salvando…' : 'Salvar nome'}
        </button>
      </footer>
    </form>
  );
}
