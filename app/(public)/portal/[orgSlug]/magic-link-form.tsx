'use client';

import { useActionState } from 'react';
import { requestMagicLinkAction, type MagicLinkState } from './actions';

const initial: MagicLinkState = undefined;

export function MagicLinkForm({ organizationSlug }: { organizationSlug: string }) {
  const [state, formAction, pending] = useActionState(requestMagicLinkAction, initial);

  if (state?.ok) {
    return (
      <div className="text-center">
        <div className="text-4xl">📬</div>
        <p className="mt-4 font-display text-lg font-medium tracking-tight">
          Verifique seu email
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Se o endereço estiver cadastrado, você receberá o link em alguns segundos.
        </p>
        <p className="mt-3 text-[0.6875rem] text-muted-foreground">
          Não recebeu? Verifique a caixa de spam.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="organizationSlug" value={organizationSlug} />
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">
          Email
        </span>
        <input
          name="email"
          type="email"
          required
          autoFocus
          placeholder="seu@email.com"
          className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none focus:border-primary focus:bg-background"
        />
      </label>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
        >
          ⚠ {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
      >
        {pending ? 'Enviando…' : 'Enviar link de acesso'}
      </button>

      <p className="text-center text-[0.6875rem] text-muted-foreground">
        Não compartilhamos seu email. O link expira em 30 minutos.
      </p>
    </form>
  );
}
