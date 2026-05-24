'use client';

import { useActionState, useState } from 'react';
import { inviteAction, type InviteState } from './actions';

const initial: InviteState | undefined = undefined;

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
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-md border border-border p-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Email</span>
        <input
          name="email"
          type="email"
          required
          placeholder="convidado@empresa.com"
          className="w-64 rounded-md border border-border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Papel</span>
        <select
          name="role"
          defaultValue="agent"
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        >
          <option value="admin">Admin</option>
          <option value="supervisor">Supervisor</option>
          <option value="agent">Agent</option>
          <option value="viewer">Viewer</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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
              className="flex-1 rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copyLink}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              {copied ? '✓' : 'Copiar'}
            </button>
          </div>
        </div>
      ) : null}

      {state && !state.ok ? (
        <p className="basis-full text-sm text-destructive" role="alert">{state.error}</p>
      ) : null}
    </form>
  );
}
