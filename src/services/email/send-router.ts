import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { sendTicketMessage } from '@/src/services/gmail/send';
import { sendTicketMessageViaSmtp } from '@/src/services/imap/send-ticket';

export type RouterResult =
  | { sent: true; via: 'gmail' | 'imap_smtp'; messageId: string }
  | { skipped: true; reason: string };

/**
 * Decide qual adapter usar pra mandar a resposta:
 * - origin=imap          → SMTP (sempre)
 * - origin=gmail         → Gmail (sempre)
 * - origin=outros        → Gmail se houver, senão SMTP
 * - fallback             → tenta o outro se o preferido não tiver conexão
 */
export async function sendTicketMessageRouted(payload: {
  ticketMessageId: string;
}): Promise<RouterResult> {
  const tm = await prisma.ticketMessage.findUnique({
    where: { id: payload.ticketMessageId },
    select: {
      id: true,
      organizationId: true,
      ticket: { select: { origin: true } },
    },
  });
  if (!tm) return { skipped: true, reason: 'message_not_found' };

  const origin = tm.ticket.origin;
  const orgId = tm.organizationId;

  const [hasGmail, hasSmtp] = await Promise.all([
    prisma.gmailConnection.count({
      where: { organizationId: orgId, status: 'active', deletedAt: null },
    }),
    prisma.imapSmtpConnection.count({
      where: { organizationId: orgId, status: 'active', deletedAt: null },
    }),
  ]);

  let prefer: 'gmail' | 'smtp';
  if (origin === 'imap') prefer = 'smtp';
  else if (origin === 'gmail') prefer = 'gmail';
  else prefer = hasGmail > 0 ? 'gmail' : 'smtp';

  // Fallback se canal preferido não tem conexão
  if (prefer === 'gmail' && hasGmail === 0 && hasSmtp > 0) prefer = 'smtp';
  if (prefer === 'smtp' && hasSmtp === 0 && hasGmail > 0) prefer = 'gmail';

  logger.info(
    { ticketMessageId: tm.id, origin, prefer, hasGmail, hasSmtp },
    'email.send route',
  );

  if (prefer === 'smtp') {
    const r = await sendTicketMessageViaSmtp({ ticketMessageId: tm.id });
    if ('sent' in r) {
      return { sent: true, via: 'imap_smtp', messageId: r.messageId };
    }
    return r;
  }

  const r = await sendTicketMessage({ ticketMessageId: tm.id });
  if ('sent' in r) {
    return { sent: true, via: 'gmail', messageId: r.gmailMessageId };
  }
  return r;
}
