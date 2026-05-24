'use client';

import { useActionState, useState } from 'react';
import { anonymizeAction, type LgpdState } from './actions';

const initial: LgpdState | undefined = undefined;

export function AnonymizeForm() {
  const [state, formAction, pending] = useActionState(anonymizeAction, initial);
  const [confirm, setConfirm] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-destructive/30 p-4">
      <h2 className="text-sm font-medium text-destructive">Anonimizar solicitante (irreversível)</h2>
      <p className="text-xs text-muted-foreground">
        Apaga email, telefone, documento, nome e corpo de emails entrantes. Mantém o ID do requester
        para que os tickets não fiquem órfãos. Audit log da operação é preservado.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">ID do requester (UUID)</span>
        <input
          name="id"
          required
          placeholder="cole o ID aqui"
          className="rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-primary"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted-foreground">Digite ANONIMIZAR para confirmar</span>
        <input
          name="confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="ANONIMIZAR"
          className="rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </label>

      {state ? (
        state.ok ? (
          <p className="text-sm text-green-700">{state.message}</p>
        ) : (
          <p className="text-sm text-destructive" role="alert">{state.error}</p>
        )
      ) : null}

      <button
        type="submit"
        disabled={pending || confirm !== 'ANONIMIZAR'}
        className="self-start rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
      >
        {pending ? 'Anonimizando…' : 'Anonimizar'}
      </button>
    </form>
  );
}
