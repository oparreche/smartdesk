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
    <aside className="sticky top-4 flex h-fit max-h-[calc(100vh-2rem)] flex-col gap-3 overflow-y-auto rounded-md border border-border bg-muted/20 p-4">
      <header className="flex flex-col gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Preview</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Ticket de exemplo (vazio = sem dados)</span>
          <input
            value={ticketCode}
            onChange={(e) => onTicketCodeChange(e.target.value.toUpperCase())}
            placeholder="HELP-100001"
            className="rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        {loading ? <p className="text-xs text-muted-foreground">Atualizando…</p> : null}
        {error ? <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p> : null}
      </header>

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
