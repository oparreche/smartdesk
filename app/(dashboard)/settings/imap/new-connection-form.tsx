'use client';

import { useActionState, useState } from 'react';
import {
  createConnectionAction,
  testConnectionAction,
  type ConnState,
} from './actions';

type Preset = {
  key: string;
  label: string;
  imap: { host: string; port: number; security: 'ssl' | 'starttls' | 'none' };
  smtp: { host: string; port: number; security: 'ssl' | 'starttls' | 'none' };
};

const PRESETS: Preset[] = [
  {
    key: 'office365',
    label: 'Office 365 / Outlook',
    imap: { host: 'outlook.office365.com', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.office365.com', port: 587, security: 'starttls' },
  },
  {
    key: 'gmail-apppwd',
    label: 'Gmail (App Password)',
    imap: { host: 'imap.gmail.com', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.gmail.com', port: 587, security: 'starttls' },
  },
  {
    key: 'zoho',
    label: 'Zoho Mail',
    imap: { host: 'imap.zoho.com', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.zoho.com', port: 587, security: 'starttls' },
  },
  {
    key: 'icloud',
    label: 'iCloud Mail',
    imap: { host: 'imap.mail.me.com', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.mail.me.com', port: 587, security: 'starttls' },
  },
];

type TestResult = {
  imap: { ok: boolean; message: string };
  smtp: { ok: boolean; message: string };
};

const initial: ConnState = undefined;

export function NewImapConnectionForm() {
  const [state, formAction, pending] = useActionState(createConnectionAction, initial);
  const [imapSec, setImapSec] = useState<'ssl' | 'starttls' | 'none'>('ssl');
  const [smtpSec, setSmtpSec] = useState<'ssl' | 'starttls' | 'none'>('starttls');
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  function applyPreset(preset: Preset) {
    const form = document.querySelector<HTMLFormElement>('form[data-imap-form]');
    if (!form) return;
    const set = (name: string, value: string) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (el) {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    set('imapHost', preset.imap.host);
    set('imapPort', String(preset.imap.port));
    set('smtpHost', preset.smtp.host);
    set('smtpPort', String(preset.smtp.port));
    setImapSec(preset.imap.security);
    setSmtpSec(preset.smtp.security);
  }

  async function runTest() {
    const form = document.querySelector<HTMLFormElement>('form[data-imap-form]');
    if (!form) return;
    setTesting(true);
    setTestResult(null);
    try {
      const fd = new FormData(form);
      fd.set('imapSecurity', imapSec);
      fd.set('smtpSecurity', smtpSec);
      const res = await testConnectionAction(fd);
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  }

  if (state && 'ok' in state && state.ok && showForm) {
    setTimeout(() => {
      setShowForm(false);
      setTestResult(null);
    }, 0);
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="divider-eyebrow text-muted-foreground">
            <span className="numeral-serif text-[0.6875rem] text-primary">01</span>
            <span className="mx-1.5 opacity-40">·</span>
            Conectar caixa IMAP/SMTP
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Office 365, Zoho, iCloud, Gmail com App Password ou qualquer servidor
            corporativo. SmartDesk recebe via IMAP e responde via SMTP.
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-md"
          >
            ＋ Nova conexão
          </button>
        ) : null}
      </header>

      {showForm ? (
        <form
          action={formAction}
          data-imap-form
          className="flex flex-col gap-5 rounded-sm border border-border bg-surface-raised p-4"
        >
          {/* Presets */}
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-secondary">Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-foreground-secondary hover:bg-muted hover:text-foreground"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
              Preenche host/porta automaticamente. Você ainda precisa colocar email/usuário/senha.
            </p>
          </div>

          {/* Identidade */}
          <Group title="Identidade">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Nome (rótulo interno)">
                <input
                  name="displayName"
                  required
                  maxLength={120}
                  placeholder="Suporte"
                  className={inputClass}
                />
              </Field>
              <Field label="Email" hint="O endereço que vai aparecer pro destinatário.">
                <input
                  name="emailAddress"
                  type="email"
                  required
                  maxLength={200}
                  placeholder="suporte@empresa.com.br"
                  className={inputClass}
                />
              </Field>
            </div>
          </Group>

          {/* IMAP */}
          <Group title="IMAP · receber emails">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr]">
              <Field label="Host">
                <input
                  name="imapHost"
                  required
                  placeholder="imap.servidor.com"
                  className={`${inputClass} font-mono text-[0.8125rem]`}
                />
              </Field>
              <Field label="Porta">
                <input
                  name="imapPort"
                  type="number"
                  required
                  defaultValue={993}
                  min={1}
                  max={65535}
                  className={`${inputClass} numeral-serif text-base`}
                />
              </Field>
              <Field label="Criptografia">
                <SecuritySelect value={imapSec} onChange={setImapSec} name="imapSecurity" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Usuário">
                <input
                  name="imapUser"
                  required
                  placeholder="suporte@empresa.com.br"
                  className={inputClass}
                />
              </Field>
              <Field label="Senha">
                <input
                  name="imapPassword"
                  type="password"
                  required
                  placeholder="••••••••"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Pasta (folder)" hint="Padrão: INBOX. Use uma específica se quiser.">
              <input
                name="imapFolder"
                placeholder="INBOX"
                className={`${inputClass} font-mono text-[0.8125rem]`}
              />
            </Field>
          </Group>

          {/* SMTP */}
          <Group title="SMTP · enviar respostas">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr]">
              <Field label="Host">
                <input
                  name="smtpHost"
                  required
                  placeholder="smtp.servidor.com"
                  className={`${inputClass} font-mono text-[0.8125rem]`}
                />
              </Field>
              <Field label="Porta">
                <input
                  name="smtpPort"
                  type="number"
                  required
                  defaultValue={587}
                  min={1}
                  max={65535}
                  className={`${inputClass} numeral-serif text-base`}
                />
              </Field>
              <Field label="Criptografia">
                <SecuritySelect value={smtpSec} onChange={setSmtpSec} name="smtpSecurity" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Usuário">
                <input
                  name="smtpUser"
                  required
                  placeholder="suporte@empresa.com.br"
                  className={inputClass}
                />
              </Field>
              <Field label="Senha">
                <input
                  name="smtpPassword"
                  type="password"
                  required
                  placeholder="••••••••"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Nome de exibição (From)" hint="ex: Suporte Acme · aparece no email do cliente.">
              <input
                name="smtpFromName"
                maxLength={120}
                placeholder="Suporte Acme"
                className={inputClass}
              />
            </Field>
          </Group>

          {testResult ? (
            <div className="rounded-sm border border-border bg-surface p-3 text-xs">
              <p className="mb-2 font-medium text-foreground-secondary">Resultado do teste:</p>
              <ul className="flex flex-col gap-1">
                <li className={testResult.imap.ok ? 'text-success' : 'text-destructive'}>
                  {testResult.imap.ok ? '✓' : '✗'} IMAP — {testResult.imap.message}
                </li>
                <li className={testResult.smtp.ok ? 'text-success' : 'text-destructive'}>
                  {testResult.smtp.ok ? '✓' : '✗'} SMTP — {testResult.smtp.message}
                </li>
              </ul>
            </div>
          ) : null}

          {state && !state.ok ? (
            <p
              role="alert"
              className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
            >
              ⚠ {state.error}
            </p>
          ) : null}

          <footer className="flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setTestResult(null);
              }}
              className="rounded-sm border border-border bg-surface px-3 py-1.5 text-xs text-foreground-secondary hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={runTest}
              disabled={testing}
              className="rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground-secondary hover:bg-muted disabled:opacity-50"
            >
              {testing ? 'Testando…' : '⚡ Testar conexão'}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-sm bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
            >
              {pending ? 'Conectando…' : 'Conectar caixa'}
            </button>
          </footer>
        </form>
      ) : null}
    </section>
  );
}

function SecuritySelect({
  value,
  onChange,
  name,
}: {
  value: 'ssl' | 'starttls' | 'none';
  onChange: (v: 'ssl' | 'starttls' | 'none') => void;
  name: string;
}) {
  return (
    <div className="relative">
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value as 'ssl' | 'starttls' | 'none')}
        className={`${inputClass} w-full appearance-none pr-8`}
      >
        <option value="ssl">SSL/TLS</option>
        <option value="starttls">STARTTLS</option>
        <option value="none">Nenhuma (não recomendado)</option>
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        ▾
      </span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border-subtle bg-surface p-3">
      <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

const inputClass =
  'rounded-sm border border-border bg-surface px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
