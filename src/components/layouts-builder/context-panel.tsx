import 'server-only';
import { buildTicketContext } from '@/src/services/enrichment/context';
import { getDefaultLayout } from '@/src/services/layouts';
import { LayoutConfigSchema } from '@/src/services/layouts/schema';
import { prepareLayout, type RenderableBlock } from '@/src/services/layouts/render-prepare';
import { logger } from '@/src/lib/logger';
import { BlockRenderer } from './blocks';

/**
 * Server Component que carrega o layout padrão da org e renderiza no lado direito
 * do ticket. Server-side: resolve vars, avalia visibleWhen, formata valores.
 */
export async function TicketContextPanel({
  organizationId,
  ticketId,
}: {
  organizationId: string;
  ticketId: string;
}) {
  const layout = await getDefaultLayout(organizationId);
  if (!layout) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Sem layout configurado. Configure um em <a href="/layouts" className="text-primary hover:underline">Painel Inteligente</a>.
      </div>
    );
  }

  let blocks: RenderableBlock[] = [];
  try {
    const config = LayoutConfigSchema.parse(layout.config);
    const ctx = await buildTicketContext(organizationId, ticketId);
    blocks = prepareLayout(config, ctx);
  } catch (err) {
    logger.error({ err, layoutId: layout.id, ticketId }, 'context-panel prepareLayout failed');
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Layout inválido. Reveja em <a href={`/layouts/${layout.id}`} className="underline">Painel Inteligente</a>.
        <p className="mt-1 text-xs">{(err as Error).message}</p>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Nenhum bloco visível para este ticket.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b) => (
        <BlockRenderer key={b.id} block={b} />
      ))}
    </div>
  );
}
