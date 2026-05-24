'use client';

import { useActionState, useRef, useEffect } from 'react';
import { createQueueAction, type QueueFormState } from './actions';

const initial: QueueFormState | undefined = undefined;

export function NewQueueForm() {
  const [state, formAction, pending] = useActionState(createQueueAction, initial);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && 'ok' in state && state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 rounded-md border border-border p-4">
      <h2 className="text-sm font-medium">Nova fila</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input
          name="name"
          required
          placeholder="Nome (ex.: Financeiro)"
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          name="description"
          placeholder="Descrição opcional"
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary md:col-span-2"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" className="h-4 w-4" />
        Definir como fila padrão
      </label>

      {state && !state.ok ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? 'Criando…' : 'Criar fila'}
      </button>
    </form>
  );
}
