'use client';

import { useActionState, useState } from 'react';
import { createWhatsappAction, type CreateState } from './actions';

const initial: CreateState | undefined = undefined;

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

export function NewConnectionForm() {
  const [state, formAction, pending] = useActionState(createWhatsappAction, initial);
  const [copied, setCopied] = useState<'url' | 'token' | null>(null);

  async function copy(text: string, what: 'url' | 'token') {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-5">
      <header>
        <p className="divider-eyebrow text-muted-foreground">
          <span className="numeral-serif text-[0.6875rem] text-primary">01</span>
          <span className="mx-1.5 opacity-40">·</span>
          Conectar número
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Cole as credenciais do WhatsApp Business Cloud API (Meta for Developers). Veja onde achar no aside →
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Telefone (display)" hint="Como aparece pro cliente.">
          <input
            name="displayPhoneNumber"
            required
            placeholder="+55 11 98888-7777"
            className={inputClass}
          />
        </Field>
        <Field label="Phone Number ID" hint="ID interno do número.">
          <input
            name="phoneNumberId"
            required
            placeholder="123456789012345"
            className={`${inputClass} font-mono text-[0.8125rem]`}
          />
        </Field>
        <Field label="Business Account ID (WABA)" hint="ID da conta WhatsApp Business." className="md:col-span-2">
          <input
            name="businessAccountId"
            required
            placeholder="987654321098765"
            className={`${inputClass} font-mono text-[0.8125rem]`}
          />
        </Field>
        <Field label="Access token (long-lived)" hint="Token permanente do System User." className="md:col-span-2">
          <input
            name="accessToken"
            type="password"
            required
            placeholder="EAAB…"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field
          label="App Secret"
          hint="Opcional — valida assinatura HMAC do webhook."
          optional
          className="md:col-span-2"
        >
          <input
            name="appSecret"
            type="password"
            placeholder="••••••"
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
        >
          ⚠ {state.error}
        </p>
      ) : null}

      <footer className="flex items-center justify-end border-t border-border-subtle pt-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
        >
          {pending ? 'Conectando…' : 'Conectar número'}
          <span aria-hidden className="font-mono text-xs">→</span>
        </button>
      </footer>

      {state && state.ok ? (
        <div className="rounded-sm border border-success/30 bg-success-soft/50 p-4">
          <p className="font-display text-sm font-medium text-success">
            ✓ Conexão criada — agora configure o webhook na Meta
          </p>
          <div className="mt-3 flex flex-col gap-3 text-xs">
            <CredField
              label="Callback URL"
              value={state.webhookUrl}
              copied={copied === 'url'}
              onCopy={() => copy(state.webhookUrl, 'url')}
            />
            <CredField
              label="Verify token"
              value={state.verifyToken}
              copied={copied === 'token'}
              onCopy={() => copy(state.verifyToken, 'token')}
            />
            <p className="text-muted-foreground">
              No Meta for Developers → <span className="font-medium text-foreground">WhatsApp → Configuration → Webhooks</span>, cole essas duas strings e assine{' '}
              <code className="rounded-sm bg-muted px-1 font-mono">messages</code> +{' '}
              <code className="rounded-sm bg-muted px-1 font-mono">message_status_updates</code>.
            </p>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function Field({
  label,
  hint,
  optional,
  className,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <span className="text-xs font-medium text-foreground-secondary">
        {label}
        {optional ? <span className="ml-1 text-muted-foreground">· opcional</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function CredField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-foreground-secondary">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          readOnly
          value={value}
          className={`${inputClass} flex-1 font-mono text-xs`}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-muted"
        >
          {copied ? '✓ copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
