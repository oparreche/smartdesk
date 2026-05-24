'use client';

import { useActionState, useRef, useEffect, useState } from 'react';
import { addMessageAction, type MessageState } from './actions';
import { MacrosPicker, type MacroOption } from './macros-picker';

const initial: MessageState | undefined = undefined;

export type ChannelOption = 'email' | 'whatsapp';

type Attach = {
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: 'uploading' | 'ready' | 'error';
  errorMessage?: string;
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 10;

export function ReplyComposer({
  code,
  ticketId,
  canReply,
  defaultChannel,
  availableChannels,
  macros,
}: {
  code: string;
  ticketId: string;
  canReply: boolean;
  defaultChannel: ChannelOption;
  availableChannels: ChannelOption[];
  macros: MacroOption[];
}) {
  const [state, formAction, pending] = useActionState(addMessageAction, initial);
  const [type, setType] = useState<'public_reply' | 'internal_note'>('public_reply');
  const [channel, setChannel] = useState<ChannelOption>(defaultChannel);
  const [attachments, setAttachments] = useState<Attach[]>([]);
  const ref = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state && 'ok' in state && state.ok) {
      ref.current?.reset();
      setAttachments([]);
    }
  }, [state]);

  // Permite que o painel de IA preencha o textarea
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (!detail?.text || !textareaRef.current) return;
      textareaRef.current.value = detail.text;
      textareaRef.current.focus();
      setType('public_reply');
      textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.addEventListener('smartdesk:composer-fill', handler);
    return () => window.removeEventListener('smartdesk:composer-fill', handler);
  }, []);

  if (!canReply) {
    return (
      <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Você não tem permissão para responder este ticket.
      </p>
    );
  }

  const isInternal = type === 'internal_note';
  const isWhatsapp = !isInternal && channel === 'whatsapp';
  const noChannel = availableChannels.length === 0;
  const hasUploading = attachments.some((a) => a.status === 'uploading');
  const readyAttachments = attachments.filter((a) => a.status === 'ready');

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const slots = MAX_FILES - attachments.length;
    if (slots <= 0) return;
    const list = Array.from(files).slice(0, slots);

    for (const file of list) {
      const idx = attachments.length + list.indexOf(file);
      void idx;
      const pending: Attach = {
        storageKey: '',
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        status: 'uploading',
      };
      setAttachments((prev) => [...prev, pending]);

      if (file.size > MAX_FILE_SIZE) {
        setAttachments((prev) =>
          prev.map((a) =>
            a === pending ? { ...a, status: 'error', errorMessage: 'arquivo > 25MB' } : a,
          ),
        );
        continue;
      }

      try {
        const signRes = await fetch('/api/uploads/sign-put', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketCode: code,
            filename: file.name,
            contentType: pending.contentType,
            sizeBytes: file.size,
          }),
        });
        if (!signRes.ok) {
          const err = await signRes.json().catch(() => ({}));
          throw new Error(err.error ?? `sign falhou (${signRes.status})`);
        }
        const { uploadUrl, key } = (await signRes.json()) as { uploadUrl: string; key: string };

        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': pending.contentType },
          body: file,
        });
        if (!putRes.ok) throw new Error(`upload S3 falhou (${putRes.status})`);

        setAttachments((prev) =>
          prev.map((a) =>
            a === pending ? { ...a, storageKey: key, status: 'ready' } : a,
          ),
        );
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a) =>
            a === pending
              ? { ...a, status: 'error', errorMessage: (err as Error).message }
              : a,
          ),
        );
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAttach(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <form
      ref={ref}
      action={formAction}
      className={`flex flex-col gap-3 rounded-md border p-4 shadow-xs transition-colors ${
        isInternal
          ? 'border-warning/30 bg-warning-soft/40'
          : isWhatsapp
            ? 'border-success/30 bg-success-soft/30'
            : 'border-border bg-surface'
      }`}
    >
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="channel" value={channel} />
      <input
        type="hidden"
        name="attachmentsJson"
        value={JSON.stringify(
          readyAttachments.map((a) => ({
            storageKey: a.storageKey,
            filename: a.filename,
            contentType: a.contentType,
            sizeBytes: a.sizeBytes,
          })),
        )}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleButton active={type === 'public_reply'} onClick={() => setType('public_reply')}>
          ↑ Resposta pública
        </ToggleButton>
        <ToggleButton active={type === 'internal_note'} onClick={() => setType('internal_note')}>
          ! Nota interna
        </ToggleButton>

        {!isInternal && availableChannels.length > 1 ? (
          <div className="ml-auto flex items-center gap-1 rounded-sm border border-border bg-surface-raised p-0.5">
            {availableChannels.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`rounded-sm px-2 py-0.5 text-[0.6875rem] font-medium transition-colors ${
                  channel === c
                    ? c === 'whatsapp'
                      ? 'bg-success text-success-soft'
                      : 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {c === 'whatsapp' ? 'WhatsApp' : 'Email'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <textarea
        ref={textareaRef}
        name="body"
        rows={5}
        required
        placeholder={
          isInternal
            ? 'Nota visível apenas para a equipe…'
            : isWhatsapp
              ? 'Mensagem WhatsApp — só funciona dentro da janela de 24h após a última mensagem do cliente.'
              : 'Digite a resposta para o solicitante…'
        }
        className="w-full rounded-sm border border-border bg-surface-raised p-3 text-sm leading-relaxed shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-background"
      />

      {/* Anexos */}
      {attachments.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((a, i) => (
            <li
              key={i}
              className={`flex items-center justify-between gap-2 rounded-sm border px-2.5 py-1.5 text-xs ${
                a.status === 'error'
                  ? 'border-destructive/30 bg-destructive-soft'
                  : a.status === 'uploading'
                    ? 'border-border bg-muted/40'
                    : 'border-border bg-surface-raised'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-muted-foreground"
                  aria-hidden
                >
                  <path d="M11.5 6L7 10.5a2.5 2.5 0 1 1-3.5-3.5L9 1.5a4 4 0 0 1 5.5 5.5L9 12.5" />
                </svg>
                <span className="truncate font-medium">{a.filename}</span>
                <span className="shrink-0 text-muted-foreground">
                  ({formatBytes(a.sizeBytes)})
                </span>
                {a.status === 'uploading' ? (
                  <span className="shrink-0 text-muted-foreground">enviando…</span>
                ) : a.status === 'error' ? (
                  <span className="shrink-0 text-destructive">{a.errorMessage}</span>
                ) : (
                  <span className="shrink-0 text-success">✓</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeAttach(i)}
                className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!isInternal && noChannel ? (
        <p className="rounded-sm border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
          Nenhum canal de envio disponível para este solicitante. A mensagem será registrada mas não enviada.
        </p>
      ) : null}

      {state && !state.ok ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          <MacrosPicker ticketId={ticketId} macros={macros} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= MAX_FILES}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-raised px-2.5 py-1 text-xs text-foreground-secondary hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11.5 6L7 10.5a2.5 2.5 0 1 1-3.5-3.5L9 1.5a4 4 0 0 1 5.5 5.5L9 12.5" />
            </svg>
            Anexar{attachments.length > 0 ? ` (${attachments.length}/${MAX_FILES})` : ''}
          </button>
          {!isInternal ? (
            <p className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
              {isWhatsapp ? (
                <>via <span className="text-success">WhatsApp</span></>
              ) : (
                <>via <span className="text-primary">Email</span></>
              )}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending || hasUploading}
          className={`inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60 ${
            isInternal
              ? 'bg-warning text-warning-soft'
              : isWhatsapp
                ? 'bg-success text-success-soft'
                : 'bg-primary text-primary-foreground'
          }`}
          title={hasUploading ? 'Aguarde uploads terminarem' : undefined}
        >
          {pending
            ? 'Enviando…'
            : hasUploading
              ? 'Aguardando anexos…'
              : isInternal
                ? 'Adicionar nota'
                : isWhatsapp
                  ? 'Enviar WhatsApp'
                  : 'Enviar resposta'}
          <span aria-hidden className="font-mono text-xs">↵</span>
        </button>
      </div>
    </form>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm border px-2.5 py-1 text-[0.75rem] font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-xs'
          : 'border-border bg-surface-raised text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
