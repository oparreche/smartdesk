'use client';

import { useActionState } from 'react';
import { signupAction, type SignupState } from './actions';

const initial: SignupState | undefined = undefined;

const fieldLabel = 'text-[0.6875rem] uppercase tracking-widest text-muted-foreground';
const fieldInput =
  'rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-background';

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="userName" className={fieldLabel}>Seu nome</label>
        <input
          id="userName"
          name="userName"
          required
          maxLength={120}
          placeholder="Maria Silva"
          className={fieldInput}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="organizationName" className={fieldLabel}>Nome da organização</label>
        <input
          id="organizationName"
          name="organizationName"
          required
          maxLength={120}
          placeholder="Acme Co"
          className={fieldInput}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={fieldLabel}>Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="voce@empresa.com"
          className={fieldInput}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={fieldLabel}>Senha · mín 8 caracteres</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
          className={fieldInput}
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
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
      >
        {pending ? 'Criando…' : 'Criar conta + organização'}
        <span aria-hidden className="font-mono text-xs">→</span>
      </button>
    </form>
  );
}
