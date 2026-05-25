'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { recategorizeTicketAction } from './actions';

export function RecategorizeButton({ code }: { code: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'info' | 'error'; text: string } | null>(null);

  function run() {
    setMsg(null);
    startTransition(async () => {
      const r = await recategorizeTicketAction({ code });
      if (!r.ok) {
        setMsg({ tone: 'error', text: r.error });
        return;
      }
      if (r.applied.length > 0) {
        setMsg({ tone: 'ok', text: `+${r.applied.length}: ${r.applied.join(', ')} (${r.engine === 'ai' ? 'IA' : 'palavras-chave'})` });
        router.refresh();
      } else if (r.reason === 'disabled') {
        setMsg({ tone: 'info', text: 'Categorização desativada nas configurações.' });
      } else if (r.reason === 'no_tags') {
        setMsg({ tone: 'info', text: 'Nenhuma tag configurada para auto-categorização.' });
      } else {
        setMsg({ tone: 'info', text: 'Nenhuma tag nova se aplicou.' });
      }
      setTimeout(() => setMsg(null), 6000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title="Aplicar tags automaticamente neste ticket"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm text-foreground-secondary transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-60"
      >
        🏷️ {pending ? 'Classificando…' : 'Recategorizar'}
      </button>
      {msg ? (
        <span
          className={[
            'text-xs',
            msg.tone === 'ok' ? 'text-primary' : msg.tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
          ].join(' ')}
        >
          {msg.text}
        </span>
      ) : null}
    </div>
  );
}
