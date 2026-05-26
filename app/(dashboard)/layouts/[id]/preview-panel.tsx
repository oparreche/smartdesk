'use client';

import { useEffect, useState } from 'react';
import { BlockRenderer } from '@/src/components/layouts-builder/blocks';
import type { LayoutConfig } from '@/src/services/layouts/schema';
import type { RenderableBlock } from '@/src/services/layouts/render-prepare';

type Props = {
  layoutId: string;
  config: LayoutConfig;
  ticketCode: string;
  onTicketCodeChange: (s: string) => void;
};

export function PreviewPanel({ config, ticketCode, onTicketCodeChange }: Props) {
  const [blocks, setBlocks] = useState<RenderableBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounce: 400ms após mudança no config ou ticketCode
  useEffect(() => {
    const handle = setTimeout(() => {
      void fetchPreview();
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config), ticketCode]);

  async function fetchPreview() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/layouts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, ticketCode: ticketCode || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === 'invalid_config'
          ? `Config inválido: ${data.issues?.[0]?.message ?? '...'}`
          : data.error === 'ticket_not_found'
            ? `Ticket ${ticketCode} não encontrado`
            : data.message ?? data.error);
        setBlocks(null);
      } else {
        setBlocks(data.blocks);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="card sticky top-4 flex h-fit max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-y-auto bg-surface-sunken/40 p-4">
      <header className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <p className="divider-eyebrow text-muted-foreground">Preview ao vivo</p>
          {loading ? <span className="text-[0.6875rem] text-muted-foreground">↻ atualizando…</span> : null}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">Ticket de exemplo <span className="font-normal text-muted-foreground">(vazio = sem dados)</span></span>
          <input
            value={ticketCode}
            onChange={(e) => onTicketCodeChange(e.target.value.toUpperCase())}
            placeholder="HELP-100001"
            className="w-full rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 font-mono text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background"
          />
        </label>
        {error ? <p className="rounded-sm border border-destructive/30 bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive">⚠ {error}</p> : null}
      </header>
      <div className="h-px bg-border-subtle" />

      <div className="flex flex-col gap-3">
        {blocks === null && !error ? (
          <p className="text-xs text-muted-foreground">Aguardando…</p>
        ) : blocks && blocks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum bloco — adicione blocos no editor.</p>
        ) : blocks ? (
          blocks.map((b) => <BlockRenderer key={b.id} block={b} />)
        ) : null}
      </div>
    </aside>
  );
}
