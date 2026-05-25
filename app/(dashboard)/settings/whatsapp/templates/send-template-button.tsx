'use client';

import { useActionState, useState } from 'react';
import { sendTemplateAction, type SendTemplateState } from './actions';

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

const initial: SendTemplateState | undefined = undefined;

export function SendTemplateButton({
  templateId,
  templateName,
  bodyText,
  varCount,
}: {
  templateId: string;
  templateName: string;
  bodyText: string;
  varCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(sendTemplateAction, initial);
  const [vars, setVars] = useState<Record<string, string>>({});

  function previewBody(): string {
    return bodyText.replace(/{{\s*(\d+)\s*}}/g, (_, n) => vars[String(n)] || `{{${n}}}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-sm border border-primary/40 bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        Enviar
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <form
        action={formAction}
        className="card flex max-h-[90vh] w-full max-w-xl flex-col gap-4 overflow-y-auto p-5"
      >
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <p className="divider-eyebrow text-muted-foreground">Enviar template</p>
            <h3 className="mt-1 font-display text-base font-medium tracking-tight">
              {templateName}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setVars({});
            }}
            className="text-[0.6875rem] text-muted-foreground hover:text-foreground"
          >
            fechar ×
          </button>
        </header>

        <input type="hidden" name="templateId" value={templateId} />

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">
            Destinatário (telefone com DDI)
          </span>
          <input
            name="recipientPhone"
            required
            placeholder="+55 11 99999-8888"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">
            Nome <span className="ml-1 text-muted-foreground">· opcional</span>
          </span>
          <input
            name="recipientName"
            placeholder="João Silva"
            maxLength={200}
            className={inputClass}
          />
        </label>

        {varCount > 0 ? (
          <div className="rounded-sm border border-border bg-surface-raised p-3">
            <p className="text-xs font-medium text-foreground-secondary">
              Variáveis ({varCount})
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {Array.from({ length: varCount }, (_, i) => i + 1).map((n) => (
                <label key={n} className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] text-muted-foreground">
                    <code className="font-mono">{`{{${n}}}`}</code>
                  </span>
                  <input
                    name={`var_${n}`}
                    required
                    value={vars[String(n)] ?? ''}
                    onChange={(e) =>
                      setVars((v) => ({ ...v, [String(n)]: e.target.value }))
                    }
                    className={`${inputClass} font-mono text-[0.8125rem]`}
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-sm border border-border bg-muted/30 p-3">
          <p className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            Preview
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{previewBody()}</p>
        </div>

        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
          >
            ⚠ {state.error}
          </p>
        ) : null}
        {state && state.ok ? (
          <p className="rounded-sm border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
            ✓ Enviado · <code className="font-mono text-[0.6875rem]">{state.waMessageId}</code>
          </p>
        ) : null}

        <footer className="flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setVars({});
            }}
            className="rounded-sm border border-border bg-surface px-3 py-1.5 text-xs hover:bg-muted"
          >
            Fechar
          </button>
          <button
            type="submit"
            disabled={pending || (state?.ok === true)}
            className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-60"
          >
            {pending ? 'Enviando…' : state?.ok ? '✓ Enviado' : 'Enviar →'}
          </button>
        </footer>
      </form>
    </div>
  );
}
