'use client';

import { useState, useTransition } from 'react';

export function VerifyEmailBanner({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<'idle' | 'sent' | 'error' | 'rate_limited'>('idle');

  function resend() {
    setState('idle');
    startTransition(async () => {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      if (res.ok) setState('sent');
      else if (res.status === 429) setState('rate_limited');
      else setState('error');
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-warning/30 bg-warning-soft/70 px-5 py-2 text-xs">
      <span className="text-warning">
        <strong>Confirme seu email.</strong>{' '}
        Mandamos um link para <code className="font-mono">{email}</code>. Sem confirmação, algumas ações podem ser limitadas.
      </span>
      <div className="flex items-center gap-2">
        {state === 'sent' ? (
          <span className="text-success">✓ Reenviado</span>
        ) : state === 'rate_limited' ? (
          <span className="text-muted-foreground-strong">Aguarde alguns minutos…</span>
        ) : state === 'error' ? (
          <span className="text-destructive">Falhou — tente novamente</span>
        ) : null}
        <button
          type="button"
          onClick={resend}
          disabled={pending || state === 'sent'}
          className="rounded-sm border border-warning/30 bg-surface-raised px-2 py-1 text-[0.6875rem] font-medium text-warning hover:bg-warning hover:text-warning-soft disabled:opacity-50"
        >
          {pending ? 'Enviando…' : 'Reenviar email'}
        </button>
      </div>
    </div>
  );
}
