'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { createRuleAction, type CreateState } from '../actions';

const initial: CreateState | undefined = undefined;

const TRIGGERS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'ticket_created', label: 'Ticket criado', hint: 'Toda vez que um ticket novo entrar no sistema (email, form, WhatsApp).' },
  { value: 'ticket_updated', label: 'Ticket atualizado', hint: 'Quando status, prioridade, fila ou responsável mudarem.' },
  { value: 'ticket_enriched', label: 'Ticket enriquecido (após integração)', hint: 'Depois que uma integração de API enriquece o ticket com dados externos.' },
  { value: 'email_received', label: 'Email recebido', hint: 'Quando o Gmail conectado receber um email novo.' },
  { value: 'form_submitted', label: 'Formulário enviado', hint: 'Quando alguém envia um formulário publicado.' },
];

export function NewRuleForm() {
  const [state, formAction, pending] = useActionState(createRuleAction, initial);
  const [trigger, setTrigger] = useState('ticket_enriched');
  const current = TRIGGERS.find((t) => t.value === trigger);

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-6">
      <header>
        <p className="divider-eyebrow text-muted-foreground">Comece com o básico</p>
        <h2 className="mt-2 font-display text-xl font-medium tracking-tight">
          Identifique a regra
        </h2>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">Nome</span>
        <input
          name="name"
          required
          maxLength={120}
          placeholder="ex: Parceiro Premium → prioridade alta"
          className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background"
        />
        <span className="text-[0.6875rem] text-muted-foreground">
          Escreva como uma frase curta — facilita ler depois na lista.
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">Disparar quando</span>
        <div className="relative">
          <select
            name="trigger"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="w-full appearance-none rounded-sm border border-border bg-surface-raised px-3 py-2 pr-8 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background"
          >
            {TRIGGERS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            ▾
          </span>
        </div>
        {current ? (
          <p className="rounded-sm border border-border bg-muted/40 px-2.5 py-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
            {current.hint}
          </p>
        ) : null}
      </div>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <footer className="mt-2 flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
        <Link
          href="/rules"
          className="rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground-secondary hover:bg-muted hover:text-foreground"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
        >
          {pending ? 'Criando…' : 'Criar regra'}
          <span aria-hidden className="font-mono text-xs">→</span>
        </button>
      </footer>
    </form>
  );
}
