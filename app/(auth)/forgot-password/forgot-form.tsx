'use client';

import { useActionState } from 'react';
import { forgotPasswordAction, type ForgotState } from './actions';

const initial: ForgotState | undefined = undefined;

export function ForgotForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initial);

  if (state && state.ok) {
    return (
      <div className="rounded-sm border border-success/30 bg-success-soft px-4 py-3 text-sm">
        <p className="font-medium text-success">Enviado.</p>
        <p className="mt-1 text-muted-foreground-strong">
          Se o email existir, você receberá em instantes um link pra redefinir a senha. Confira sua caixa de entrada (e spam).
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
          Email da conta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="voce@empresa.com"
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
        {pending ? 'Enviando…' : 'Enviar link de recuperação'}
        <span aria-hidden className="font-mono text-xs">→</span>
      </button>
    </form>
  );
}
