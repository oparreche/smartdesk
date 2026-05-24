'use client';

import { useActionState, useState } from 'react';
import { submitCsatAction, type SubmitState } from './actions';

const initial: SubmitState = undefined;

const LABELS: Record<number, { emoji: string; label: string; color: string }> = {
  1: { emoji: '😡', label: 'Muito ruim', color: 'text-destructive' },
  2: { emoji: '😞', label: 'Ruim', color: 'text-warning' },
  3: { emoji: '😐', label: 'Razoável', color: 'text-muted-foreground' },
  4: { emoji: '🙂', label: 'Bom', color: 'text-foreground' },
  5: { emoji: '🤩', label: 'Excelente', color: 'text-success' },
};

export function CsatForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(submitCsatAction, initial);
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (state?.ok) {
    return (
      <div className="text-center">
        <div className="numeral-serif text-5xl text-success">✓</div>
        <p className="mt-4 font-display text-lg font-medium tracking-tight">
          Obrigado pelo feedback!
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua avaliação foi registrada.
        </p>
      </div>
    );
  }

  const display = hover ?? rating;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={rating ?? ''} />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-medium text-foreground-secondary">
          Sua nota
        </legend>
        <div className="flex justify-between gap-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const meta = LABELS[n];
            const active = display === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-md border-2 px-2 py-3 transition-all ${
                  active
                    ? 'border-primary bg-primary-soft shadow-sm'
                    : 'border-border bg-surface-raised hover:border-primary/40'
                }`}
              >
                <span className={`text-3xl ${active ? '' : 'grayscale opacity-70'}`}>
                  {meta.emoji}
                </span>
                <span className={`text-[0.6875rem] font-medium ${active ? meta.color : 'text-muted-foreground'}`}>
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">
          Comentário <span className="text-muted-foreground">· opcional</span>
        </span>
        <textarea
          name="comment"
          rows={3}
          maxLength={2000}
          placeholder="O que poderíamos melhorar?"
          className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background"
        />
      </label>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
        >
          ⚠ {translateError(state.error)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || rating === null}
        className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-50"
      >
        {pending ? 'Enviando…' : 'Enviar avaliação'}
      </button>
    </form>
  );
}

function translateError(code: string): string {
  switch (code) {
    case 'already_submitted':
      return 'Você já respondeu essa pesquisa.';
    case 'not_found':
      return 'Link inválido ou expirado.';
    case 'rating_out_of_range':
      return 'Selecione uma nota de 1 a 5.';
    default:
      return code;
  }
}
