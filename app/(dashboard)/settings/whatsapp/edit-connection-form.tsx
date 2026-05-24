'use client';

import { useState, useTransition } from 'react';
import { updateWhatsappAction } from './actions';

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

export function EditConnectionForm({
  id,
  tokenLast4,
  hasAppSecret,
}: {
  id: string;
  tokenLast4: string;
  hasAppSecret: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<'ok' | 'error' | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setFeedback(null);
          setOpen(true);
        }}
        className="rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
      >
        Editar
      </button>
    );
  }

  function handleSubmit(form: FormData) {
    setFeedback(null);
    startTransition(async () => {
      try {
        await updateWhatsappAction(form);
        setFeedback('ok');
        setAccessToken('');
        setAppSecret('');
        setTimeout(() => {
          setOpen(false);
          setFeedback(null);
        }, 1200);
      } catch {
        setFeedback('error');
      }
    });
  }

  return (
    <form
      action={handleSubmit}
      className="mt-3 flex flex-col gap-3 rounded-sm border border-border bg-surface-raised p-3"
    >
      <input type="hidden" name="id" value={id} />
      <header className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-foreground-secondary">
          Rotacionar credenciais
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setAccessToken('');
            setAppSecret('');
            setFeedback(null);
          }}
          className="text-[0.6875rem] text-muted-foreground hover:text-foreground"
        >
          fechar
        </button>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">
          Novo access token <span className="ml-1 text-muted-foreground">· deixa vazio pra manter o atual (••• {tokenLast4})</span>
        </span>
        <input
          name="accessToken"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          type="password"
          placeholder="EAA…"
          autoComplete="off"
          className={`${inputClass} font-mono`}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">
          App Secret{' '}
          <span className="ml-1 text-muted-foreground">
            · {hasAppSecret ? 'configurado, deixe vazio pra manter' : 'opcional'}
          </span>
        </span>
        <input
          name="appSecret"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          type="password"
          placeholder="••••••"
          autoComplete="off"
          className={`${inputClass} font-mono`}
        />
      </label>

      {feedback === 'ok' ? (
        <p className="rounded-sm border border-success/30 bg-success-soft px-2 py-1 text-[0.6875rem] text-success">
          ✓ Atualizado
        </p>
      ) : null}
      {feedback === 'error' ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-2 py-1 text-[0.6875rem] text-destructive"
        >
          ⚠ Falhou — verifique os valores
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-2">
        <button
          type="submit"
          disabled={pending || (!accessToken && !appSecret)}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-60"
        >
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
