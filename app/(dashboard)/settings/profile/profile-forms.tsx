'use client';

import { useActionState } from 'react';
import { updateNameAction, changePasswordAction, type ProfileState } from './actions';

const initial: ProfileState | undefined = undefined;

export function NameForm({ initialName }: { initialName: string }) {
  const [state, formAction, pending] = useActionState(updateNameAction, initial);

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-5">
      <header>
        <p className="divider-eyebrow text-muted-foreground">
          <span className="numeral-serif text-[0.6875rem] text-primary">01</span>
          <span className="mx-1.5 opacity-40">·</span>
          Identidade
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Como você aparece pra outros membros da organização.
        </p>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">Nome de exibição</span>
        <input
          name="name"
          defaultValue={initialName}
          required
          maxLength={120}
          className={inputClass}
        />
      </label>

      {state ? <Feedback state={state} /> : null}

      <footer className="flex items-center justify-end border-t border-border-subtle pt-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
        >
          {pending ? 'Salvando…' : 'Salvar nome'}
        </button>
      </footer>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={formAction} className="card flex flex-col gap-4 p-5">
      <header>
        <p className="divider-eyebrow text-muted-foreground">
          <span className="numeral-serif text-[0.6875rem] text-primary">02</span>
          <span className="mx-1.5 opacity-40">·</span>
          Segurança
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Troque a senha periodicamente. Você será desconectado das outras sessões.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">Senha atual</span>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">
            Nova senha <span className="text-muted-foreground">· mín. 8 caracteres</span>
          </span>
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
      </div>

      {state ? <Feedback state={state} /> : null}

      <footer className="flex items-center justify-end border-t border-border-subtle pt-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
        >
          {pending ? 'Alterando…' : 'Alterar senha'}
        </button>
      </footer>
    </form>
  );
}

function Feedback({ state }: { state: ProfileState }) {
  if (state.ok) {
    return (
      <p className="rounded-sm border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
        ✓ {state.message}
      </p>
    );
  }
  return (
    <p
      role="alert"
      className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
    >
      {state.error}
    </p>
  );
}

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';
