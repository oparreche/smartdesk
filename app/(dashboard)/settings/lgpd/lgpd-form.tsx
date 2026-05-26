'use client';

import { useActionState, useState } from 'react';
import { anonymizeAction, type LgpdState } from './actions';

const initial: LgpdState | undefined = undefined;

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

export function AnonymizeForm() {
  const [state, formAction, pending] = useActionState(anonymizeAction, initial);
  const [confirm, setConfirm] = useState('');

  return (
    <form action={formAction} className="card flex flex-col gap-4 border-destructive/30 bg-destructive-soft/20 p-5">
      <div>
        <p className="divider-eyebrow text-destructive">Zona de risco · irreversível</p>
        <h2 className="mt-1.5 font-display text-lg font-semibold tracking-tight text-foreground">
          Anonimizar solicitante
        </h2>
        <p className="mt-1.5 max-w-2xl text-xs text-muted-foreground">
          Apaga email, telefone, documento, nome e corpo de emails entrantes. Mantém o ID do
          requester para que os tickets não fiquem órfãos. O audit log da operação é preservado.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">ID do requester (UUID)</span>
        <input name="id" required placeholder="cole o ID aqui" className={`${inputClass} font-mono text-xs`} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">
          Digite <span className="font-mono text-destructive">ANONIMIZAR</span> para confirmar
        </span>
        <input
          name="confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="ANONIMIZAR"
          className={`${inputClass} font-mono`}
        />
      </label>

      {state ? (
        state.ok ? (
          <p className="rounded-sm border border-success/30 bg-success-soft px-2.5 py-1.5 text-xs text-success">
            ✓ {state.message}
          </p>
        ) : (
          <p className="rounded-sm border border-destructive/30 bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive" role="alert">
            ⚠ {state.error}
          </p>
        )
      ) : null}

      <button
        type="submit"
        disabled={pending || confirm !== 'ANONIMIZAR'}
        className="self-start rounded-sm bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-40"
      >
        {pending ? 'Anonimizando…' : 'Anonimizar'}
      </button>
    </form>
  );
}
