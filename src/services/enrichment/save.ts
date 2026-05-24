import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { runRules } from '@/src/services/rules/run';

/**
 * Persiste um enriquecimento no ticket. Marca o anterior da mesma integração
 * como `isCurrent=false` (histórico preservado, current único).
 * Dispara regras com trigger `ticket_enriched` em seguida.
 */
export async function saveEnrichment(input: {
  organizationId: string;
  ticketId: string;
  integrationId: string;
  runId: string;
  data: Record<string, unknown>;
}): Promise<{ id: string }> {
  const created = await prisma.$transaction(async (tx) => {
    await tx.ticketEnrichment.updateMany({
      where: {
        organizationId: input.organizationId,
        ticketId: input.ticketId,
        integrationId: input.integrationId,
        isCurrent: true,
      },
      data: { isCurrent: false },
    });

    const c = await tx.ticketEnrichment.create({
      data: {
        organizationId: input.organizationId,
        ticketId: input.ticketId,
        integrationId: input.integrationId,
        runId: input.runId,
        data: JSON.parse(JSON.stringify(input.data)) as Prisma.InputJsonValue,
        isCurrent: true,
      },
      select: { id: true },
    });

    await tx.ticketEvent.create({
      data: {
        organizationId: input.organizationId,
        ticketId: input.ticketId,
        type: 'enrichment_completed',
        payload: {
          integrationId: input.integrationId,
          enrichmentId: c.id,
          runId: input.runId,
        } as Prisma.InputJsonObject,
      },
    });

    return c;
  });

  // Trigger regras "ticket_enriched" — depois da transação pra usar context atualizado
  try {
    await runRules({
      organizationId: input.organizationId,
      ticketId: input.ticketId,
      trigger: 'ticket_enriched',
    });
  } catch (err) {
    logger.warn(
      { err, ticketId: input.ticketId, integrationId: input.integrationId },
      'runRules on ticket_enriched failed (continuing)',
    );
  }

  return created;
}

/**
 * Lê todos os enriquecimentos atuais do ticket.
 */
export async function getCurrentEnrichments(organizationId: string, ticketId: string) {
  return prisma.ticketEnrichment.findMany({
    where: { organizationId, ticketId, isCurrent: true },
    include: { integration: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}
