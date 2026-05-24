'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createTicketAction, type CreateTicketState } from './actions';

type QueueOption = { id: string; name: string; isDefault: boolean };

const initial: CreateTicketState | undefined = undefined;

export function NewTicketForm({ queues }: { queues: QueueOption[] }) {
  const [state, formAction, pending] = useActionState(createTicketAction, initial);
  const defaultQueue = queues.find((q) => q.isDefault) ?? queues[0];

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* 01 — Solicitante */}
      <Section eyebrow="01" title="Solicitante" hint="Pelo menos um identificador (email, documento ou telefone) ajuda a deduplicar o histórico.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome">
            <input
              name="requesterName"
              placeholder="João Silva"
              maxLength={120}
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              name="requesterEmail"
              type="email"
              placeholder="joao@empresa.com"
              maxLength={200}
              className={inputClass}
            />
          </Field>
          <Field label="Documento (CPF/CNPJ)">
            <input
              name="requesterDocument"
              placeholder="00.000.000/0001-00"
              maxLength={20}
              className={inputClass}
            />
          </Field>
          <Field label="Telefone">
            <input
              name="requesterPhone"
              placeholder="(11) 99999-9999"
              maxLength={32}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      {/* 02 — Ticket */}
      <Section eyebrow="02" title="Detalhes do chamado">
        <Field label="Assunto" required>
          <input
            name="subject"
            required
            placeholder="Resumo curto do que aconteceu"
            maxLength={200}
            className={inputClass}
          />
        </Field>
        <Field label="Descrição" hint="Markdown simples é aceito.">
          <textarea
            name="description"
            rows={6}
            placeholder="Detalhes, passos, contexto…"
            maxLength={20_000}
            className={`${inputClass} font-sans leading-relaxed`}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Fila">
            <SelectBox
              name="queueId"
              defaultValue={defaultQueue?.id ?? ''}
              options={[
                { value: '', label: '— sem fila —' },
                ...queues.map((q) => ({
                  value: q.id,
                  label: `${q.name}${q.isDefault ? ' (padrão)' : ''}`,
                })),
              ]}
            />
          </Field>
          <Field label="Prioridade">
            <SelectBox
              name="priority"
              defaultValue="normal"
              options={[
                { value: 'low', label: 'Baixa' },
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'Alta' },
                { value: 'urgent', label: 'Urgente' },
                { value: 'critical', label: 'Crítica' },
              ]}
            />
          </Field>
        </div>
      </Section>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <footer className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-[0.6875rem] text-muted-foreground">
          Origem registrada como <span className="font-mono text-foreground">manual</span>.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/tickets"
            className="rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground-secondary hover:bg-muted hover:text-foreground"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
          >
            {pending ? 'Criando…' : 'Criar ticket'}
            <span aria-hidden className="font-mono text-xs">→</span>
          </button>
        </div>
      </footer>
    </form>
  );
}

function Section({
  eyebrow,
  title,
  hint,
  children,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-4 p-5">
      <header>
        <p className="divider-eyebrow text-muted-foreground">
          <span className="numeral-serif text-[0.6875rem] text-primary">{eyebrow}</span>
          <span className="mx-1.5 opacity-40">·</span>
          {title}
        </p>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function SelectBox({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative">
      <select
        name={name}
        defaultValue={defaultValue}
        className={`${inputClass} w-full appearance-none pr-8`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        ▾
      </span>
    </div>
  );
}

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground-secondary">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
