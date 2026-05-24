'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="voce@empresa.com"
          className="rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-background"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background"
        />
      </div>

      {state?.error ? (
        <p className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
      >
        {pending ? 'Entrando…' : 'Entrar'}
        <span aria-hidden className="font-mono text-xs">→</span>
      </button>
    </form>
  );
}
