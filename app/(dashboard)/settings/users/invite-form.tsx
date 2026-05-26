'use client';

import { useActionState, useState } from 'react';
import { inviteAction, type InviteState } from './actions';

const initial: InviteState | undefined = undefined;

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteAction, initial);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (state && 'inviteUrl' in state) {
      await navigator.clipboard.writeText(state.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <form action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">Email</span>
        <input
          name="email"
          type="email"
          required
          placeholder="convidado@empresa.com"
          className={`${inputClass} w-64`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">Papel</span>
        <div className="relative">
          <select name="role" defaultValue="agent" className={`${inputClass} appearance-none pr-8`}>
            <option value="admin">Admin</option>
            <option value="supervisor">Supervisor</option>
            <option value="agent">Agent</option>
            <option value="viewer">Viewer</option>
          </select>
          <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
        </div>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
      >
        {pending ? 'Gerando…' : 'Gerar convite'}
      </button>

      {state && state.ok ? (
        <div className="basis-full">
          <p className="text-xs text-muted-foreground">Compartilhe este link (válido por 7 dias):</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              readOnly
              value={state.inviteUrl}
              className="flex-1 rounded-sm border border-border bg-surface-sunken px-2.5 py-1.5 font-mono text-xs shadow-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copyLink}
              className="rounded-sm border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground-secondary hover:bg-muted hover:text-foreground"
            >
              {copied ? '✓ copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      ) : null}

      {state && !state.ok ? (
        <p className="basis-full rounded-sm border border-destructive/30 bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive" role="alert">
          ⚠ {state.error}
        </p>
      ) : null}
    </form>
  );
}
