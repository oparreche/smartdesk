'use client';

import { useActionState, useRef, useEffect } from 'react';
import { createQueueAction, type QueueFormState } from './actions';

const initial: QueueFormState | undefined = undefined;

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

export function NewQueueForm() {
  const [state, formAction, pending] = useActionState(createQueueAction, initial);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && 'ok' in state && state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="card flex flex-col gap-4 p-5">
      <p className="divider-eyebrow text-muted-foreground">Nova fila</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input name="name" required placeholder="Nome (ex.: Financeiro)" className={inputClass} />
        <input name="description" placeholder="Descrição opcional" className={`${inputClass} md:col-span-2`} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" className="h-4 w-4" />
        Definir como fila padrão
      </label>

      {state && !state.ok ? (
        <p className="rounded-sm border border-destructive/30 bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive" role="alert">
          ⚠ {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
      >
        {pending ? 'Criando…' : 'Criar fila'}
      </button>
    </form>
  );
}
