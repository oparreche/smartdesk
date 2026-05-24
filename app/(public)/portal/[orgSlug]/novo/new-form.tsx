'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { portalCreateTicketAction, type NewTicketState } from '../actions';
import { suggestArticlesAction } from './kb-suggest-actions';

type Suggestion = { slug: string; title: string; excerpt: string | null };

const initial: NewTicketState = undefined;

export function NewPortalTicketForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction, pending] = useActionState(portalCreateTicketAction, initial);
  const [subject, setSubject] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const term = subject.trim();
    if (term.length < 4) {
      setSuggestions([]);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const r = await suggestArticlesAction({ orgSlug, query: term });
        setSuggestions(r);
      } catch {
        setSuggestions([]);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [subject, orgSlug]);

  if (state?.ok) {
    return (
      <div className="text-center">
        <div className="text-4xl">✓</div>
        <p className="mt-4 font-display text-lg font-medium tracking-tight">
          Chamado registrado
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu protocolo:{' '}
          <code className="numeral-serif rounded-sm bg-muted px-1.5 py-0.5 text-primary">
            {state.code}
          </code>
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href={`/portal/${orgSlug}/ticket/${state.code}`}
            className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
          >
            Ver chamado
          </Link>
          <Link
            href={`/portal/${orgSlug}`}
            className="rounded-sm border border-border bg-surface-raised px-4 py-2 text-sm text-foreground-secondary hover:bg-muted"
          >
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">
          Assunto
        </span>
        <input
          name="subject"
          required
          minLength={3}
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Em uma frase, o que aconteceu"
          autoFocus
          className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none focus:border-primary focus:bg-background"
        />
      </label>

      {suggestions.length > 0 ? (
        <div className="rounded-sm border border-primary/20 bg-primary-soft/30 p-3">
          <p className="mb-2 text-[0.6875rem] font-medium uppercase tracking-widest text-primary">
            💡 Antes de abrir, talvez isto ajude:
          </p>
          <ul className="flex flex-col gap-1.5">
            {suggestions.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/help/${orgSlug}/${s.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-sm bg-surface p-2 transition-colors hover:bg-muted/40"
                >
                  <p className="text-xs font-medium text-foreground">{s.title}</p>
                  {s.excerpt ? (
                    <p className="mt-0.5 line-clamp-1 text-[0.6875rem] text-muted-foreground">
                      {s.excerpt}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">
          Descrição <span className="text-muted-foreground">· opcional</span>
        </span>
        <textarea
          name="description"
          rows={6}
          maxLength={20_000}
          placeholder="Detalhes, contexto, passos pra reproduzir, etc."
          className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm leading-relaxed shadow-xs outline-none focus:border-primary focus:bg-background"
        />
      </label>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
        >
          ⚠ {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Link
          href={`/portal/${orgSlug}`}
          className="rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground-secondary hover:bg-muted"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
        >
          {pending ? 'Enviando…' : 'Enviar chamado'}
          <span aria-hidden className="font-mono text-xs">→</span>
        </button>
      </div>
    </form>
  );
}
