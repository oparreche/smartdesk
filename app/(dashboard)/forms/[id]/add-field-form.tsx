'use client';

import { useState, useTransition, useRef } from 'react';
import { addFieldAction } from '../actions';
import { FieldIcon } from './field-icons';

const TYPES: { value: string; label: string; group: string }[] = [
  { value: 'text', label: 'Texto curto', group: 'Texto' },
  { value: 'textarea', label: 'Texto longo', group: 'Texto' },
  { value: 'email', label: 'Email', group: 'Contato' },
  { value: 'phone', label: 'Telefone', group: 'Contato' },
  { value: 'document', label: 'CPF/CNPJ', group: 'Contato' },
  { value: 'url', label: 'URL', group: 'Contato' },
  { value: 'number', label: 'Número', group: 'Numérico' },
  { value: 'currency', label: 'Moeda', group: 'Numérico' },
  { value: 'date', label: 'Data', group: 'Outros' },
  { value: 'select', label: 'Lista (1 opção)', group: 'Escolha' },
  { value: 'multiselect', label: 'Lista (várias)', group: 'Escolha' },
  { value: 'checkbox', label: 'Checkbox', group: 'Escolha' },
  { value: 'hidden', label: 'Oculto', group: 'Outros' },
];

const MAPS_TO: { value: string; label: string }[] = [
  { value: '', label: '— Custom field (não mapeado) —' },
  { value: 'ticket.subject', label: 'Assunto do ticket' },
  { value: 'ticket.description', label: 'Descrição do ticket' },
  { value: 'requester.name', label: 'Nome do solicitante' },
  { value: 'requester.email', label: 'Email do solicitante' },
  { value: 'requester.phone', label: 'Telefone do solicitante' },
  { value: 'requester.document', label: 'Documento do solicitante' },
];

export function AddFieldForm({ formId }: { formId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('text');
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  const needsOptions = type === 'select' || type === 'multiselect';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface/40 px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:border-primary hover:bg-primary-soft hover:text-primary"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-muted text-foreground-secondary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">＋</span>
        Adicionar campo
      </button>
    );
  }

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        startTransition(() =>
          addFieldAction(fd).then(() => {
            form.reset();
            setType('text');
            setOpen(false);
          }),
        );
      }}
      className="flex flex-col gap-4 rounded-md border-2 border-primary/30 bg-primary-soft/30 p-4 shadow-sm"
    >
      <input type="hidden" name="formId" value={formId} />

      <header className="flex items-center justify-between">
        <h3 className="divider-eyebrow text-primary">Novo campo</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">Rótulo *</span>
          <input
            name="label"
            required
            maxLength={120}
            autoFocus
            placeholder="ex.: CNPJ"
            className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">Tipo</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-muted-foreground">
              <FieldIcon type={type} className="h-4 w-4" />
            </span>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full appearance-none rounded-sm border border-border bg-surface-raised pl-9 pr-3 py-2 text-sm shadow-xs outline-none focus:border-primary"
            >
              {Array.from(new Set(TYPES.map((t) => t.group))).map((g) => (
                <optgroup key={g} label={g}>
                  {TYPES.filter((t) => t.group === g).map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">Mapeia para</span>
        <select
          name="mapsTo"
          defaultValue=""
          className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none focus:border-primary"
        >
          {MAPS_TO.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <span className="text-[0.6875rem] text-muted-foreground">
          Define se este campo preenche um dado do ticket/solicitante ou fica como custom field.
        </span>
      </label>

      {needsOptions ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">Opções (separadas por vírgula) *</span>
          <input
            name="options"
            required={needsOptions}
            placeholder="opção 1, opção 2, opção 3"
            className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none focus:border-primary"
          />
        </label>
      ) : null}

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="required" className="h-3.5 w-3.5 accent-primary" />
          <span>Campo obrigatório</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
        >
          {pending ? 'Adicionando…' : 'Adicionar campo'}
          <span aria-hidden className="font-mono text-xs">↵</span>
        </button>
      </div>
    </form>
  );
}
