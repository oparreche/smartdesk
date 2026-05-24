import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';

/**
 * Gera o próximo código sequencial do ticket para uma organização.
 *
 * Atômico: usa `UPDATE ... SET ticket_seq = ticket_seq + 1` + `RETURNING ticket_seq`
 * (no MySQL, é feito via UPDATE seguido de SELECT dentro de uma transação serializável).
 *
 * Formato: HELP-<seq>, onde seq começa em 100001 (Organization.ticketSeq default = 100000).
 */
export async function nextTicketCode(organizationId: string): Promise<string> {
  const seq = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: { ticketSeq: { increment: 1 } },
        select: { ticketSeq: true },
      });
      return updated.ticketSeq;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );

  return `HELP-${seq}`;
}
