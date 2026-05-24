'use client';

import { useState } from 'react';
import { voteHelpfulAction } from './actions';

export function HelpfulVote({
  articleId,
  initialYes,
  initialNo,
}: {
  articleId: string;
  initialYes: number;
  initialNo: number;
}) {
  const [voted, setVoted] = useState<'yes' | 'no' | null>(null);
  const [yes, setYes] = useState(initialYes);
  const [no, setNo] = useState(initialNo);

  async function vote(v: 'yes' | 'no') {
    if (voted) return;
    setVoted(v);
    if (v === 'yes') setYes((n) => n + 1);
    else setNo((n) => n + 1);
    try {
      await voteHelpfulAction({ articleId, helpful: v === 'yes' });
    } catch {
      /* noop */
    }
  }

  if (voted) {
    return (
      <p className="text-xs text-success">
        ✓ Obrigado pelo feedback!
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <p>Esse artigo foi útil?</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => vote('yes')}
          className="rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-sm hover:border-success hover:bg-success-soft hover:text-success"
        >
          👍 Sim {yes > 0 ? <span className="ml-1 numeral-serif text-[0.6875rem]">{yes}</span> : null}
        </button>
        <button
          type="button"
          onClick={() => vote('no')}
          className="rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-sm hover:border-destructive hover:bg-destructive-soft hover:text-destructive"
        >
          👎 Não {no > 0 ? <span className="ml-1 numeral-serif text-[0.6875rem]">{no}</span> : null}
        </button>
      </div>
    </div>
  );
}
