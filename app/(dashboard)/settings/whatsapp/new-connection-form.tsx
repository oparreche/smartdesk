'use client';

import { useActionState, useState } from 'react';
import { createWhatsappAction, type CreateState } from './actions';

const initial: CreateState | undefined = undefined;

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

type StepId = 0 | 1 | 2 | 3 | 4;

const STEPS: ReadonlyArray<{ id: StepId; label: string }> = [
  { id: 0, label: 'Antes de começar' },
  { id: 1, label: 'Número de exibição' },
  { id: 2, label: 'IDs do WhatsApp Manager' },
  { id: 3, label: 'Token de acesso' },
  { id: 4, label: 'Webhook' },
];

export function NewConnectionForm() {
  const [state, formAction, pending] = useActionState(createWhatsappAction, initial);
  const [step, setStep] = useState<StepId>(0);
  const [copied, setCopied] = useState<'url' | 'token' | null>(null);

  // dados acumulados — controlam inputs mesmo entre steps
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');

  async function copy(text: string, what: 'url' | 'token') {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  // Se o save funcionou, salta direto pro step 4 (webhook).
  const isCreated = state?.ok === true;
  const effectiveStep: StepId = isCreated ? 4 : step;

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-5">
      <header className="flex flex-col gap-3 border-b border-border-subtle pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="divider-eyebrow text-muted-foreground">
            <span className="numeral-serif text-[0.6875rem] text-primary">01</span>
            <span className="mx-1.5 opacity-40">·</span>
            Conectar número WhatsApp
          </p>
          <p className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            Passo {effectiveStep + 1}/{STEPS.length}
          </p>
        </div>
        <Stepper current={effectiveStep} disabled={isCreated} onPick={(id) => !isCreated && setStep(id)} />
      </header>

      {/* Inputs hidden para garantir que TODOS os valores acompanham o submit no último step */}
      <input type="hidden" name="displayPhoneNumber" value={displayPhoneNumber} />
      <input type="hidden" name="phoneNumberId" value={phoneNumberId} />
      <input type="hidden" name="businessAccountId" value={businessAccountId} />
      <input type="hidden" name="accessToken" value={accessToken} />
      <input type="hidden" name="appSecret" value={appSecret} />

      {effectiveStep === 0 ? (
        <StepIntro onNext={() => setStep(1)} />
      ) : effectiveStep === 1 ? (
        <StepDisplay
          value={displayPhoneNumber}
          onChange={setDisplayPhoneNumber}
          onPrev={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      ) : effectiveStep === 2 ? (
        <StepIds
          phoneNumberId={phoneNumberId}
          businessAccountId={businessAccountId}
          onPhoneNumberId={setPhoneNumberId}
          onBusinessAccountId={setBusinessAccountId}
          onPrev={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      ) : effectiveStep === 3 ? (
        <StepToken
          accessToken={accessToken}
          appSecret={appSecret}
          onAccessToken={setAccessToken}
          onAppSecret={setAppSecret}
          onPrev={() => setStep(2)}
          pending={pending}
          error={state && !state.ok ? state.error : null}
        />
      ) : (
        <StepWebhook
          state={state}
          copied={copied}
          onCopy={copy}
        />
      )}
    </form>
  );
}

/* ──────────────────────────────────────────
   Stepper visual
   ────────────────────────────────────────── */
function Stepper({
  current,
  disabled,
  onPick,
}: {
  current: StepId;
  disabled: boolean;
  onPick: (id: StepId) => void;
}) {
  return (
    <ol className="flex items-center gap-1 text-[0.6875rem]">
      {STEPS.map((s, i) => {
        const isPast = i < current;
        const isCurr = i === current;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              disabled={disabled || i > current}
              onClick={() => onPick(s.id)}
              className={[
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-medium transition-colors',
                isCurr
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isPast
                  ? 'border-success/40 bg-success-soft text-success hover:border-success'
                  : 'border-border bg-surface-raised text-muted-foreground',
                disabled || i > current ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              ].join(' ')}
              title={s.label}
              aria-current={isCurr ? 'step' : undefined}
            >
              {isPast ? '✓' : i + 1}
            </button>
            {i < STEPS.length - 1 ? (
              <span
                aria-hidden
                className={`h-px flex-1 ${isPast ? 'bg-success/40' : 'bg-border'}`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ──────────────────────────────────────────
   Step 0 — Intro
   ────────────────────────────────────────── */
function StepIntro({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-base font-medium tracking-tight">Antes de começar</h3>
      <p className="text-sm text-muted-foreground">
        Pra conectar um número, você vai precisar de 4 coisas — vou te guiar a buscar cada uma
        no painel da Meta:
      </p>
      <ol className="flex flex-col gap-2.5 text-sm">
        <Bullet n="1" title="Número de WhatsApp já verificado">
          Cadastrado no WhatsApp Manager via Cloud API (não o app WhatsApp Business comum).
        </Bullet>
        <Bullet n="2" title="WhatsApp Business Account (WABA)">
          A conta que agrupa o(s) número(s). Cada SmartDesk vira uma conexão por número.
        </Bullet>
        <Bullet n="3" title="App do Meta for Developers">
          Em <ExtLink href="https://developers.facebook.com/apps">developers.facebook.com</ExtLink>,
          com produto WhatsApp adicionado.
        </Bullet>
        <Bullet n="4" title="System User com token (60 dias ou nunca expira)">
          Em <ExtLink href="https://business.facebook.com/settings/system-users">business.facebook.com</ExtLink>{' '}
          → System Users → Generate token. Selecione escopos{' '}
          <Code>whatsapp_business_messaging</Code> e <Code>whatsapp_business_management</Code>.
        </Bullet>
      </ol>
      <div className="flex items-center justify-end border-t border-border-subtle pt-3">
        <NavBtn onClick={onNext}>Começar →</NavBtn>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   Step 1 — Display number
   ────────────────────────────────────────── */
function StepDisplay({
  value,
  onChange,
  onPrev,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const valid = /^\+\d{8,16}$/.test(value.replace(/\s|-/g, ''));
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-base font-medium tracking-tight">
        Qual o número (jeito que aparece pro cliente)?
      </h3>
      <p className="text-sm text-muted-foreground">
        Formato internacional, com DDI e DDD. Vai aparecer assim em cima da conversa.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">Telefone</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          placeholder="+55 11 98888-7777"
          className={inputClass}
          autoFocus
        />
        <span className="text-[0.6875rem] text-muted-foreground">
          Aceita espaços e hífens; salvamos como está.
        </span>
      </label>
      <Nav onPrev={onPrev} onNext={onNext} nextDisabled={!valid} />
    </div>
  );
}

/* ──────────────────────────────────────────
   Step 2 — Phone Number ID + WABA ID
   ────────────────────────────────────────── */
function StepIds({
  phoneNumberId,
  businessAccountId,
  onPhoneNumberId,
  onBusinessAccountId,
  onPrev,
  onNext,
}: {
  phoneNumberId: string;
  businessAccountId: string;
  onPhoneNumberId: (v: string) => void;
  onBusinessAccountId: (v: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const valid = /^\d{8,}$/.test(phoneNumberId.trim()) && /^\d{8,}$/.test(businessAccountId.trim());
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-base font-medium tracking-tight">
        Pegue o Phone Number ID e o WABA ID
      </h3>

      <Guide
        title="Phone Number ID"
        url="https://business.facebook.com/wa/manage/phone-numbers/"
        steps={[
          'Abra o WhatsApp Manager (botão abaixo).',
          'Phone numbers → clique no número.',
          'O painel da direita mostra "Phone number ID" — copie só os dígitos.',
        ]}
        value={phoneNumberId}
        onChange={onPhoneNumberId}
        placeholder="123456789012345"
        ctaLabel="Abrir WhatsApp Manager"
      />

      <Guide
        title="Business Account ID (WABA)"
        url="https://business.facebook.com/latest/settings/whatsapp_accounts"
        steps={[
          'Abra Business Settings → WhatsApp accounts (botão abaixo).',
          'Selecione sua conta — o ID aparece bem embaixo do nome.',
          'Também aparece na URL como ?asset_id=...',
        ]}
        value={businessAccountId}
        onChange={onBusinessAccountId}
        placeholder="987654321098765"
        ctaLabel="Abrir Business Settings"
      />

      <Nav onPrev={onPrev} onNext={onNext} nextDisabled={!valid} />
    </div>
  );
}

/* ──────────────────────────────────────────
   Step 3 — Access Token + App Secret
   ────────────────────────────────────────── */
function StepToken({
  accessToken,
  appSecret,
  onAccessToken,
  onAppSecret,
  onPrev,
  pending,
  error,
}: {
  accessToken: string;
  appSecret: string;
  onAccessToken: (v: string) => void;
  onAppSecret: (v: string) => void;
  onPrev: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-base font-medium tracking-tight">
        Cole o token do System User
      </h3>
      <p className="text-sm text-muted-foreground">
        Esse token autoriza o SmartDesk a enviar mensagens em nome do seu número. Idealmente
        permanente (sem expiração), mas aceita o de 60 dias também — renove antes de vencer.
      </p>

      <div className="rounded-sm border border-border bg-surface-raised p-3">
        <p className="text-xs font-medium text-foreground-secondary">Como gerar o token</p>
        <ol className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <span className="numeral-serif text-primary">1.</span> Abra{' '}
            <ExtLink href="https://business.facebook.com/settings/system-users">
              Business Settings → System Users
            </ExtLink>
            .
          </li>
          <li>
            <span className="numeral-serif text-primary">2.</span> Selecione seu System User
            (ex.: <Code>SmartDesk Bot</Code>) → botão <Code>Generate new token</Code>.
          </li>
          <li>
            <span className="numeral-serif text-primary">3.</span> Escolha o App SmartDesk,
            validade <Code>Never expire</Code> (ou 60 dias).
          </li>
          <li>
            <span className="numeral-serif text-primary">4.</span> Marque os escopos:{' '}
            <Code>whatsapp_business_messaging</Code> +{' '}
            <Code>whatsapp_business_management</Code>.
          </li>
          <li>
            <span className="numeral-serif text-primary">5.</span> Copie o token (começa com{' '}
            <Code>EAA…</Code>) — ele só aparece uma vez.
          </li>
        </ol>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">Access token</span>
        <input
          value={accessToken}
          onChange={(e) => onAccessToken(e.target.value)}
          type="password"
          required
          placeholder="EAA…"
          className={`${inputClass} font-mono`}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">
          App Secret <span className="ml-1 text-muted-foreground">· opcional</span>
        </span>
        <input
          value={appSecret}
          onChange={(e) => onAppSecret(e.target.value)}
          type="password"
          placeholder="••••••"
          className={`${inputClass} font-mono`}
        />
        <span className="text-[0.6875rem] text-muted-foreground">
          Em App dashboard → Settings → Basic → App Secret. Habilita validação HMAC do webhook
          (recomendado, mas não obrigatório).
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
        >
          ⚠ {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between border-t border-border-subtle pt-4">
        <NavBtn onClick={onPrev} variant="ghost">
          ← Voltar
        </NavBtn>
        <button
          type="submit"
          disabled={pending || !accessToken}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
        >
          {pending ? 'Conectando…' : 'Criar conexão'}
          <span aria-hidden className="font-mono text-xs">→</span>
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   Step 4 — Webhook (sucesso)
   ────────────────────────────────────────── */
function StepWebhook({
  state,
  copied,
  onCopy,
}: {
  state: CreateState | undefined;
  copied: 'url' | 'token' | null;
  onCopy: (text: string, what: 'url' | 'token') => void;
}) {
  if (!state || !state.ok) {
    return (
      <div className="rounded-sm border border-destructive/30 bg-destructive-soft p-4 text-xs text-destructive">
        Estado inesperado — recarregue a página.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-display text-base font-medium text-success">
          ✓ Conexão criada
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Falta o último passo: dizer pro Meta pra entregar as mensagens aqui. Cole os dois
          valores abaixo no painel da Meta.
        </p>
      </div>

      <CredField
        label="Callback URL"
        value={state.webhookUrl}
        copied={copied === 'url'}
        onCopy={() => onCopy(state.webhookUrl, 'url')}
      />
      <CredField
        label="Verify token"
        value={state.verifyToken}
        copied={copied === 'token'}
        onCopy={() => onCopy(state.verifyToken, 'token')}
      />

      <div className="rounded-sm border border-border bg-surface-raised p-3">
        <p className="text-xs font-medium text-foreground-secondary">No Meta for Developers</p>
        <ol className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <span className="numeral-serif text-primary">1.</span> Abra{' '}
            <ExtLink href="https://developers.facebook.com/apps">
              developers.facebook.com/apps
            </ExtLink>{' '}
            → seu app SmartDesk → produto <Code>WhatsApp</Code> → <Code>Configuration</Code>.
          </li>
          <li>
            <span className="numeral-serif text-primary">2.</span> Em <Code>Webhook</Code>{' '}
            clique <Code>Edit</Code> → cole a Callback URL e o Verify token acima.
          </li>
          <li>
            <span className="numeral-serif text-primary">3.</span> Em <Code>Webhook fields</Code>{' '}
            assine <Code>messages</Code> + <Code>message_status_updates</Code>.
          </li>
          <li>
            <span className="numeral-serif text-primary">4.</span> Mande uma mensagem de teste
            pro número — aparece como ticket aqui em segundos.
          </li>
        </ol>
      </div>

      <div className="flex items-center justify-end border-t border-border-subtle pt-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm"
        >
          Concluído
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   Pequenos utilitários
   ────────────────────────────────────────── */

function Guide({
  title,
  url,
  steps,
  value,
  onChange,
  placeholder,
  ctaLabel,
}: {
  title: string;
  url: string;
  steps: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ctaLabel: string;
}) {
  return (
    <div className="rounded-sm border border-border bg-surface-raised p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-foreground-secondary">{title}</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-sm border border-border bg-surface px-2.5 py-1 text-[0.6875rem] text-primary transition-colors hover:bg-muted"
        >
          {ctaLabel} ↗
        </a>
      </div>
      <ol className="mt-2 flex flex-col gap-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="numeral-serif text-primary">{i + 1}.</span> {s}
          </li>
        ))}
      </ol>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder={placeholder}
        className={`${inputClass} mt-3 w-full font-mono text-[0.8125rem]`}
        inputMode="numeric"
      />
    </div>
  );
}

function Bullet({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-sm border border-border bg-surface-raised p-2.5">
      <span className="numeral-serif mt-px text-base font-medium leading-none text-primary">
        {n}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{children}</span>
      </div>
    </li>
  );
}

function Nav({
  onPrev,
  onNext,
  nextDisabled,
}: {
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border-subtle pt-3">
      <NavBtn onClick={onPrev} variant="ghost">
        ← Voltar
      </NavBtn>
      <NavBtn onClick={onNext} disabled={nextDisabled}>
        Próximo →
      </NavBtn>
    </div>
  );
}

function NavBtn({
  children,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'ghost';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'rounded-sm px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
        variant === 'ghost'
          ? 'border border-border bg-surface text-foreground-secondary hover:bg-muted'
          : 'bg-primary text-primary-foreground shadow-sm hover:shadow-md',
      ].join(' ')}
    >
      {children}
    </button>
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

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">{children}</code>;
}
