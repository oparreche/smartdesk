'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createTagAction, type TagFormState } from './actions';

const initial: TagFormState | undefined = undefined;

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

export function NewTagForm() {
  const [state, formAction, pending] = useActionState(createTagAction, initial);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && 'ok' in state && state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground-secondary" htmlFor="tag-name">Nome</label>
        <input id="tag-name" name="name" required placeholder="ex.: VIP" className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground-secondary" htmlFor="tag-color">Cor (hex)</label>
        <input
          id="tag-color"
          name="color"
          placeholder="#ef4444"
          pattern="^#([0-9a-fA-F]{3}){1,2}$"
          className={`${inputClass} w-32 font-mono`}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
      >
        {pending ? 'Criando…' : 'Criar tag'}
      </button>
      {state && !state.ok ? (
        <p className="basis-full rounded-sm border border-destructive/30 bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive" role="alert">
          ⚠ {state.error}
        </p>
      ) : null}
    </form>
  );
}
