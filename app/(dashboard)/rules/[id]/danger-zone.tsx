'use client';

import { useState } from 'react';
import { deleteRuleAction } from '../actions';

export function DangerZone({ ruleId, ruleName }: { ruleId: string; ruleName: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="rounded-md border border-destructive/30 bg-destructive-soft/30 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="divider-eyebrow text-destructive">Zona de perigo</p>
          <h3 className="mt-1 font-display text-base font-medium tracking-tight">
            Excluir regra
          </h3>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Soft-delete — a regra para de rodar imediatamente, mas o histórico de
            execuções fica preservado em auditoria.
          </p>
        </div>

        {confirming ? (
          <form action={deleteRuleAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={ruleId} />
            <p className="text-[0.6875rem] text-destructive">
              Excluir <span className="font-medium">{ruleName}</span>?
            </p>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-sm border border-border bg-surface-raised px-2.5 py-1 text-xs text-foreground-secondary hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-sm bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-soft shadow-sm hover:shadow-md"
            >
              Confirmar exclusão
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded-sm border border-destructive/30 bg-surface-raised px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive-soft"
          >
            Excluir…
          </button>
        )}
      </div>
    </section>
  );
}
