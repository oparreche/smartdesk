'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteTicketAction } from './actions';

/**
 * Botão de exclusão (soft delete) com confirmação inline em dois cliques.
 * Usado na lista (`icon`), no card do kanban (`card`) e na barra do detalhe (`bar`).
 * Se `redirectTo` for passado, navega após excluir; senão, atualiza a tela.
 */
export function DeleteTicketButton({
  ticketId,
  variant = 'icon',
  redirectTo,
}: {
  ticketId: string;
  variant?: 'icon' | 'card' | 'bar';
  redirectTo?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function arm(e: React.MouseEvent) {
    stop(e);
    setError(null);
    setConfirming(true);
  }

  function cancel(e: React.MouseEvent) {
    stop(e);
    setConfirming(false);
  }

  function confirm(e: React.MouseEvent) {
    stop(e);
    startTransition(async () => {
      const r = await deleteTicketAction({ ticketId });
      if (r.ok) {
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } else {
        setError(r.error);
        setConfirming(false);
        setTimeout(() => setError(null), 4000);
      }
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="text-[0.625rem] text-muted-foreground">Excluir?</span>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="rounded-sm bg-destructive px-1.5 py-0.5 text-[0.625rem] font-medium text-destructive-foreground disabled:opacity-60"
        >
          {pending ? '…' : 'Sim'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="rounded-sm border border-border px-1.5 py-0.5 text-[0.625rem] text-muted-foreground hover:text-foreground"
        >
          Não
        </button>
      </span>
    );
  }

  if (error) {
    return (
      <span className="whitespace-nowrap text-[0.625rem] text-destructive" title={error}>
        ⚠ {error}
      </span>
    );
  }

  if (variant === 'bar') {
    return (
      <button
        type="button"
        onClick={arm}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1 text-sm text-destructive transition-colors hover:bg-destructive-soft"
      >
        🗑 Excluir
      </button>
    );
  }

  if (variant === 'card') {
    return (
      <button
        type="button"
        onClick={arm}
        title="Excluir ticket"
        aria-label="Excluir ticket"
        className="rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[0.625rem] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
      >
        🗑
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={arm}
      title="Excluir ticket"
      aria-label="Excluir ticket"
      className="rounded-sm px-1.5 py-1 text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
    >
      🗑
    </button>
  );
}
