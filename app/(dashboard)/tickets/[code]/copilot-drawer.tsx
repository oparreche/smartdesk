'use client';

import { useActionState, useState } from 'react';
import { askCopilotAboutTicketAction, type TurnState } from '@/app/(dashboard)/copilot/actions';

const initial: TurnState | undefined = undefined;

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

type Turn = {
  user: string;
  assistant?: string;
  citations?: TurnState extends infer T ? (T extends { citations: infer C } ? C : never) : never;
};

export function CopilotDrawer({ ticketCode }: { ticketCode: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(askCopilotAboutTicketAction, initial);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');

  if (state?.ok && state.conversationId !== conversationId) {
    setConversationId(state.conversationId);
  }
  if (state?.ok && turns.length > 0 && !turns[turns.length - 1]!.assistant) {
    const next = [...turns];
    next[next.length - 1] = {
      ...next[next.length - 1]!,
      assistant: state.assistantText,
      citations: state.citations as Turn['citations'],
    };
    setTurns(next);
  }

  function handleSubmit(form: FormData) {
    const m = String(form.get('message') ?? '').trim();
    if (!m) return;
    setTurns([...turns, { user: m }]);
    setDraft('');
    return formAction(form);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:shadow-xl active:translate-y-px"
        title="Pergunte ao Copilot sobre esse ticket"
      >
        ✨ Copilot
      </button>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Copilot</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            sobre {ticketCode}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {conversationId ? (
            <button
              type="button"
              onClick={() => { setConversationId(undefined); setTurns([]); }}
              title="Nova conversa"
              className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted"
            >
              ＋ Nova
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted"
          >
            fechar ×
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Contexto do ticket carregado.</p>
            <p className="mt-1">
              Pergunte algo — ex.: <em>como respondemos isso normalmente?</em>,{' '}
              <em>esboce uma resposta cordial</em>, <em>resume a conversa pra mim</em>.
            </p>
          </div>
        ) : (
          turns.map((t, i) => (
            <article key={i} className="flex flex-col gap-1.5">
              <div className="self-end max-w-[85%] rounded-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                {t.user}
              </div>
              {t.assistant ? (
                <div className="self-start max-w-[92%]">
                  <div className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm whitespace-pre-wrap text-foreground">
                    {t.assistant}
                  </div>
                  {t.citations && t.citations.length > 0 ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1">
                      {t.citations.slice(0, 5).map((c, idx: number) => (
                        <li key={c.chunkId} className="text-[0.625rem]">
                          {c.refUrl ? (
                            <a
                              href={c.refUrl}
                              target={c.refUrl.startsWith('http') ? '_blank' : undefined}
                              rel="noreferrer"
                              className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-muted-foreground hover:border-primary/40 hover:text-primary"
                            >
                              [{idx + 1}] {(c.refLabel ?? 'fonte').slice(0, 30)}
                            </a>
                          ) : (
                            <span className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-muted-foreground">
                              [{idx + 1}] {(c.refLabel ?? 'fonte').slice(0, 30)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : pending ? (
                <div className="self-start text-xs text-muted-foreground">↻ pensando…</div>
              ) : null}
            </article>
          ))
        )}
        {state && !state.ok ? (
          <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive">
            ⚠ {state.error}
          </p>
        ) : null}
      </div>

      <form action={handleSubmit} className="flex gap-2 border-t border-border px-4 py-3">
        <input type="hidden" name="ticketCode" value={ticketCode} />
        {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
        <input
          name="message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          required
          maxLength={4000}
          placeholder="Pergunte algo…"
          autoComplete="off"
          className={`${inputClass} flex-1`}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-sm bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-60"
        >
          {pending ? '↻' : 'Enviar'}
        </button>
      </form>
    </aside>
  );
}
