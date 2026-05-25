'use client';

import { useActionState } from 'react';
import { saveCategorizationConfigAction } from './actions';
import type { TagFormState } from './actions';

type Mode = 'auto' | 'keywords' | 'ai';

export function CategorizationSettings({
  enabled,
  mode,
  hasTenantKey,
  aiConfiguredGlobally,
}: {
  enabled: boolean;
  mode: Mode;
  hasTenantKey: boolean;
  aiConfiguredGlobally: boolean;
}) {
  const [state, formAction, pending] = useActionState<TagFormState | undefined, FormData>(
    saveCategorizationConfigAction,
    undefined,
  );

  return (
    <section className="card flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">Categorização automática</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Aplica tags automaticamente em novos tickets com base na descrição e nas palavras-chave
          que você define em cada tag. Use o Gemini para interpretar o significado, ou apenas a
          contagem de palavras-chave.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={enabled}
            className="h-4 w-4"
          />
          <span className="font-medium">Ativar categorização automática</span>
        </label>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Modo</label>
          <select
            name="mode"
            defaultValue={mode}
            className="w-full max-w-xs rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
          >
            <option value="auto">Automático — Gemini se houver chave, senão palavras-chave</option>
            <option value="keywords">Sempre palavras-chave (sem IA)</option>
            <option value="ai">Sempre Gemini (requer chave)</option>
          </select>
          {!aiConfiguredGlobally && !hasTenantKey ? (
            <p className="text-[0.6875rem] text-amber-700">
              ⚠ Nenhuma chave Gemini disponível. Sem chave, os modos com IA caem para palavras-chave.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Chave Gemini do tenant (opcional)
          </label>
          <input
            type="password"
            name="geminiApiKey"
            placeholder={hasTenantKey ? '•••••••• (já configurada — preencha para trocar)' : aiConfiguredGlobally ? 'usando chave global do sistema' : 'AIza…'}
            autoComplete="off"
            className="w-full max-w-md rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
          />
          <p className="text-[0.6875rem] text-muted-foreground">
            Deixe em branco para manter a atual. A chave é armazenada criptografada.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
          >
            {pending ? 'Salvando…' : 'Salvar configuração'}
          </button>
          {state?.ok ? <span className="text-xs text-primary">✓ Salvo</span> : null}
          {state && !state.ok ? <span className="text-xs text-destructive">⚠ {state.error}</span> : null}
        </div>
      </form>
    </section>
  );
}
