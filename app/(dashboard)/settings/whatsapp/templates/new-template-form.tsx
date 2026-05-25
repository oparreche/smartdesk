'use client';

import { useActionState, useState } from 'react';
import { createTemplateAction, type CreateTemplateState } from './actions';

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

const initial: CreateTemplateState | undefined = undefined;

type Conn = { id: string; displayPhoneNumber: string };

export function NewTemplateForm({ connections }: { connections: Conn[] }) {
  const [state, formAction, pending] = useActionState(createTemplateAction, initial);
  const [open, setOpen] = useState(false);
  const [bodyText, setBodyText] = useState('Olá {{1}}, seu pedido {{2}} foi atualizado.');

  if (state?.ok) {
    return (
      <section className="card flex flex-col gap-3 p-5">
        <p className="font-display text-sm font-medium text-success">
          ✓ Template enviado pro Meta
        </p>
        <p className="text-xs text-muted-foreground">
          Status inicial: <span className="font-mono">pending</span>. Análise costuma levar minutos
          a algumas horas. Você verá a mudança aqui (sync automático).
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="self-end rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Entendi
        </button>
      </section>
    );
  }

  if (!open) {
    return (
      <section className="card flex items-center justify-between gap-3 p-5">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Templates aprovados pela Meta</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie mensagens estruturadas que podem ser enviadas fora da janela de 24h.
          </p>
        </div>
        <button
          type="button"
          disabled={connections.length === 0}
          onClick={() => setOpen(true)}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          ＋ Novo template
        </button>
      </section>
    );
  }

  const varHits = bodyText.match(/{{\s*\d+\s*}}/g) ?? [];

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-5">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Novo template</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use <code className="rounded-sm bg-muted px-1 font-mono">{'{{1}}'}</code>,{' '}
            <code className="rounded-sm bg-muted px-1 font-mono">{'{{2}}'}</code> etc no corpo pra
            criar variáveis. Vão ser preenchidas no momento do envio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[0.6875rem] text-muted-foreground hover:text-foreground"
        >
          fechar
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">Número (WABA)</span>
          <select name="connectionId" required className={inputClass}>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayPhoneNumber}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">
            Nome interno · só letras, números, _
          </span>
          <input
            name="name"
            required
            maxLength={64}
            pattern="[a-z0-9_]+"
            placeholder="pedido_atualizado"
            className={`${inputClass} font-mono`}
            onInput={(e) => {
              e.currentTarget.value = e.currentTarget.value
                .toLowerCase()
                .replace(/[^a-z0-9_]+/g, '_');
            }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">Idioma</span>
          <select name="language" required defaultValue="pt_BR" className={inputClass}>
            <option value="pt_BR">Português (BR)</option>
            <option value="en_US">English (US)</option>
            <option value="es_ES">Español (ES)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">Categoria</span>
          <select name="category" required defaultValue="utility" className={inputClass}>
            <option value="utility">Utility — atualizações, confirmações, alertas (mais barato)</option>
            <option value="marketing">Marketing — promoções, novidades (mais caro)</option>
            <option value="authentication">Authentication — OTP, códigos de acesso</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="text-xs font-medium text-foreground-secondary">
            Header (texto, opcional) · max 60
          </span>
          <input
            name="headerText"
            maxLength={60}
            placeholder="Atualização do pedido"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="text-xs font-medium text-foreground-secondary">
            Corpo · max 1024
            {varHits.length ? (
              <span className="ml-2 text-[0.6875rem] text-primary">
                · {varHits.length} variável{varHits.length > 1 ? 'is' : ''} detectada
                {varHits.length > 1 ? 's' : ''}
              </span>
            ) : null}
          </span>
          <textarea
            name="bodyText"
            required
            maxLength={1024}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={4}
            className={`${inputClass} font-mono text-[0.8125rem]`}
          />
        </label>

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="text-xs font-medium text-foreground-secondary">
            Footer (opcional) · max 60
          </span>
          <input
            name="footerText"
            maxLength={60}
            placeholder="SmartDesk · não responda este número"
            className={inputClass}
          />
        </label>
      </div>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
        >
          ⚠ {state.error}
        </p>
      ) : null}

      <footer className="flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-sm border border-border bg-surface px-3 py-1.5 text-xs hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-60"
        >
          {pending ? 'Enviando…' : 'Enviar pro Meta →'}
        </button>
      </footer>
    </form>
  );
}
