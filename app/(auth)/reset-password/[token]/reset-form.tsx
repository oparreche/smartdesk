'use client';

import { useActionState } from 'react';
import { resetPasswordAction, type ResetState } from './actions';

const initial: ResetState | undefined = undefined;

export function ResetForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <div className="rounded-sm border border-border bg-muted/30 p-3 text-sm">
        <p className="text-xs text-muted-foreground">Definindo nova senha para</p>
        <p className="mt-0.5 font-mono">{email}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
          Nova senha (mín 8)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
          placeholder="••••••••"
          className="rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background"
        />
      </div>

      {state && !state.ok ? (
        <p className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
      >
        {pending ? 'Salvando…' : 'Definir senha'}
        <span aria-hidden className="font-mono text-xs">→</span>
      </button>
    </form>
  );
}
