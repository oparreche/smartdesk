'use client';

import { useActionState, useState } from 'react';
import { askCopilotAction, type TurnState } from './actions';

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

const initial: TurnState | undefined = undefined;

type Turn = {
  user: string;
  assistant?: string;
  citations?: TurnState extends infer T ? (T extends { citations: infer C } ? C : never) : never;
};

export function CopilotChat({ totalChunks }: { totalChunks: number }) {
  const [state, formAction, pending] = useActionState(askCopilotAction, initial);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');

  // Quando o action retorna, propaga pro estado local
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

  return (
    <section className="card flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Chat</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalChunks > 0
              ? `Pesquisa em ${totalChunks} chunks indexados`
              : 'Nenhum chunk indexado ainda — adicione fontes em Gestão.'}
          </p>
        </div>
        {conversationId ? (
          <button
            type="button"
            onClick={() => { setConversationId(undefined); setTurns([]); }}
            className="rounded-sm border border-border bg-surface px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            ＋ Nova conversa
          </button>
        ) : null}
      </header>

      <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
        {turns.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Pergunte algo — ex.: <em>qual nossa política de devolução?</em> ou <em>como resolvemos
            tickets parecidos com cobrança duplicada?</em>
          </p>
        ) : (
          turns.map((t, i) => (
            <article key={i} className="flex flex-col gap-2">
              <div className="self-end max-w-[80%] rounded-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                {t.user}
              </div>
              {t.assistant ? (
                <div className="self-start max-w-[88%]">
                  <div className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm whitespace-pre-wrap text-foreground">
                    {t.assistant}
                  </div>
                  {t.citations && t.citations.length > 0 ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {t.citations.map((c, idx: number) => (
                        <li key={c.chunkId} className="text-[0.6875rem]">
                          {c.refUrl ? (
                            <a
                              href={c.refUrl}
                              target={c.refUrl.startsWith('http') ? '_blank' : undefined}
                              rel="noreferrer"
                              className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-muted-foreground hover:border-primary/40 hover:text-primary"
                            >
                              [{idx + 1}] {c.refLabel ?? 'fonte'}
                            </a>
                          ) : (
                            <span className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-muted-foreground">
                              [{idx + 1}] {c.refLabel ?? 'fonte'}
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

      <form action={handleSubmit} className="flex gap-2 border-t border-border-subtle pt-3">
        {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
        <input
          name="message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          required
          maxLength={4000}
          placeholder="Pergunte algo ao copilot…"
          autoComplete="off"
          className={`${inputClass} flex-1`}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-60"
        >
          {pending ? 'Enviando…' : 'Enviar →'}
        </button>
      </form>
    </section>
  );
}
