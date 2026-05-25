'use client';

import { useActionState } from 'react';
import { addUrlSourceAction, type AddUrlState } from './actions';

const initial: AddUrlState | undefined = undefined;

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

export function AddUrlForm() {
  const [state, formAction, pending] = useActionState(addUrlSourceAction, initial);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_auto]">
        <input
          name="url"
          type="url"
          required
          placeholder="https://docs.empresa.com/politica-de-devolucao"
          className={inputClass}
        />
        <input
          name="name"
          maxLength={200}
          placeholder="Nome amigável (opcional)"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-sm bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Adicionando…' : '＋ Indexar URL'}
        </button>
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-xs text-destructive">⚠ {state.error}</p>
      ) : null}
      {state && state.ok ? (
        <p className="text-xs text-success">✓ Fonte adicionada — indexação rodando em background.</p>
      ) : null}
    </form>
  );
}
