'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { setTicketViewPrefAction } from './actions';

export function ViewToggle({ current }: { current: 'list' | 'kanban' }) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  function urlFor(view: 'list' | 'kanban'): string {
    const params = new URLSearchParams(search);
    params.set('view', view);
    return `/tickets?${params.toString()}`;
  }

  function pickAndSave(view: 'list' | 'kanban') {
    startTransition(async () => {
      await setTicketViewPrefAction(view);
      router.push(urlFor(view));
    });
  }

  return (
    <div className="inline-flex items-center rounded-sm border border-border bg-surface-raised p-0.5">
      {(['list', 'kanban'] as const).map((v) => {
        const active = v === current;
        return (
          <button
            key={v}
            type="button"
            onClick={() => !active && pickAndSave(v)}
            disabled={pending || active}
            className={[
              'flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            ].join(' ')}
            title={`Definir ${v === 'list' ? 'Lista' : 'Kanban'} como visualização padrão`}
          >
            {v === 'list' ? (
              <>☰ Lista</>
            ) : (
              <>▣ Kanban</>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Versão pra usar antes do server saber a preferência — só link sem persist. */
export function ViewToggleLinks({ current }: { current: 'list' | 'kanban' }) {
  const search = useSearchParams();
  function url(view: 'list' | 'kanban'): string {
    const p = new URLSearchParams(search);
    p.set('view', view);
    return `/tickets?${p.toString()}`;
  }
  return (
    <div className="inline-flex items-center rounded-sm border border-border bg-surface-raised p-0.5">
      <Link
        href={url('list')}
        className={[
          'rounded-sm px-2.5 py-1 text-xs font-medium',
          current === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
        ].join(' ')}
      >
        ☰ Lista
      </Link>
      <Link
        href={url('kanban')}
        className={[
          'rounded-sm px-2.5 py-1 text-xs font-medium',
          current === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
        ].join(' ')}
      >
        ▣ Kanban
      </Link>
    </div>
  );
}
