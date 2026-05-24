import 'server-only';
import { prisma } from '@/src/lib/prisma';

/**
 * Constrói o contexto de variáveis disponível para templates e regras.
 *
 * Estrutura:
 *   {
 *     ticket: { id, code, subject, ... requester: {...}, custom_fields: {...} },
 *     organization: { id, slug },
 *     now: ISO string,
 *     ...enrichments espalhados no top-level (partner, billing, etc.)
 *   }
 *
 * Os enriquecimentos atuais (isCurrent=true) são misturados no top-level —
 * permitindo `{{partner.id}}` direto, sem `{{enrichments.partner.id}}`.
 */
export async function buildTicketContext(
  organizationId: string,
  ticketId: string,
  extra?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId, deletedAt: null },
    include: {
      requester: true,
      queue: { select: { id: true, slug: true, name: true } },
      tags: { include: { tag: true } },
      enrichments: { where: { isCurrent: true } },
      organization: { select: { id: true, slug: true } },
    },
  });
  if (!ticket) throw new Error('Ticket não encontrado');

  const ctx: Record<string, unknown> = {
    ticket: {
      id: ticket.id,
      code: ticket.code,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      origin: ticket.origin,
      queue: ticket.queue?.slug ?? null,
      tags: ticket.tags.map((t) => t.tag.name),
      custom_fields: ticket.customFields ?? {},
      requester: {
        id: ticket.requester.id,
        email: ticket.requester.email,
        phone: ticket.requester.phone,
        document: ticket.requester.document,
        name: ticket.requester.name,
        externalId: ticket.requester.externalId,
        external_id: ticket.requester.externalId,
        custom_fields: ticket.requester.customFields ?? {},
      },
    },
    organization: { id: ticket.organization.id, slug: ticket.organization.slug },
    now: new Date().toISOString(),
  };

  // Espalhar enrichments no top-level: { partner: {...}, billing: {...} }
  for (const e of ticket.enrichments) {
    const data = e.data as Record<string, unknown> | null;
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data)) {
        ctx[k] = v;
      }
    }
  }

  // Extras (ex.: form values em form.submitted)
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      ctx[k] = v;
    }
  }

  return ctx;
}
