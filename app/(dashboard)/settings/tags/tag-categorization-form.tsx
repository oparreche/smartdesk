'use client';

import { useActionState } from 'react';
import { updateTagCategorizationAction } from './actions';
import type { TagFormState } from './actions';

export function TagCategorizationForm({
  id,
  description,
  keywords,
  minKeywordMatches,
  autoCategorize,
}: {
  id: string;
  description: string | null;
  keywords: string[];
  minKeywordMatches: number;
  autoCategorize: boolean;
}) {
  const [state, formAction, pending] = useActionState<TagFormState | undefined, FormData>(
    updateTagCategorizationAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-border-subtle bg-surface-sunken/40 px-4 py-4">
      <input type="hidden" name="id" value={id} />

      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="autoCategorize" defaultChecked={autoCategorize} className="h-4 w-4" />
        <span className="font-medium">Participar da categorização automática</span>
      </label>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          O que esta tag significa / quais emails devem tê-la
        </label>
        <textarea
          name="description"
          defaultValue={description ?? ''}
          rows={2}
          placeholder="Ex.: Assuntos financeiros — cobranças, pagamentos, comissões, valores não recebidos."
          className="w-full rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        />
        <p className="text-[0.6875rem] text-muted-foreground">Usado pelo Gemini para interpretar e taggear corretamente.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Palavras-chave (vírgula ou linha)</label>
          <textarea
            name="keywords"
            defaultValue={keywords.join(', ')}
            rows={2}
            placeholder="pedido, comissão, valores, não caiu, recebi"
            className="w-full rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Mínimo p/ aplicar</label>
          <input
            type="number"
            name="minKeywordMatches"
            min={1}
            max={10}
            defaultValue={minKeywordMatches}
            className="w-24 rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
          />
          <p className="text-[0.6875rem] text-muted-foreground">palavras distintas</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-sm border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        {state?.ok ? <span className="text-xs text-primary">✓ Salvo</span> : null}
        {state && !state.ok ? <span className="text-xs text-destructive">⚠ {state.error}</span> : null}
      </div>
    </form>
  );
}
