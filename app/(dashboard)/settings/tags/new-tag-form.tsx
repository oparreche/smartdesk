'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createTagAction, type TagFormState } from './actions';

const initial: TagFormState | undefined = undefined;

export function NewTagForm() {
  const [state, formAction, pending] = useActionState(createTagAction, initial);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && 'ok' in state && state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-md border border-border p-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="tag-name">Nome</label>
        <input
          id="tag-name"
          name="name"
          required
          placeholder="ex.: VIP"
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="tag-color">Cor (hex)</label>
        <input
          id="tag-color"
          name="color"
          placeholder="#ef4444"
          pattern="^#([0-9a-fA-F]{3}){1,2}$"
          className="w-32 rounded-md border border-border px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? 'Criando…' : 'Criar tag'}
      </button>
      {state && !state.ok ? (
        <p className="basis-full text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
