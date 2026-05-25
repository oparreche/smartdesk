'use client';

import { useState } from 'react';
import { deleteRuleFromListAction } from './actions';

export function RuleDeleteButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <form action={deleteRuleFromListAction} className="flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted"
        >
          cancelar
        </button>
        <button
          type="submit"
          className="rounded-sm bg-destructive px-2 py-1 text-[0.6875rem] font-medium text-destructive-foreground hover:shadow-sm"
        >
          excluir?
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title="Excluir regra"
      aria-label="Excluir regra"
      className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
    >
      ✕
    </button>
  );
}
