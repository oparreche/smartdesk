'use client';

import { useActionState } from 'react';
import { acceptInviteAction, type AcceptState } from './actions';

const initial: AcceptState | undefined = undefined;

export function AcceptForm({ token, email, role, organizationName }: {
  token: string;
  email: string;
  role: string;
  organizationName: string;
}) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
        <p>Convite para <strong>{organizationName}</strong></p>
        <p className="mt-1 text-xs text-muted-foreground">Email: {email} · papel: {role}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">Seu nome</label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">Defina sua senha (mín 8)</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {state && !state.ok ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? 'Aceitando…' : 'Aceitar e entrar'}
      </button>
    </form>
  );
}
