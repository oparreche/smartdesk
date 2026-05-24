import 'server-only';
import { google } from 'googleapis';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { authenticatedClient } from './oauth';
import { enqueue } from '@/src/services/jobs/enqueue';

export type PollResult = {
  connectionsChecked: number;
  jobsEnqueued: number;
  errors: number;
};

/**
 * Para cada GmailConnection ativa, busca mensagens novas e enfileira jobs
 * `gmail.ingest_message` (com dedup por messageId).
 *
 * Estratégia:
 *  - Se temos historyId salvo: users.history.list a partir dele
 *  - Senão (primeira sync ou history expirado): users.messages.list q="newer_than:1d -in:sent -label:CHAT"
 */
export async function pollGmailConnections(): Promise<PollResult> {
  const connections = await prisma.gmailConnection.findMany({
    where: { status: 'active', deletedAt: null },
    select: { id: true, organizationId: true, emailAddress: true, historyId: true },
  });

  let jobsEnqueued = 0;
  let errors = 0;

  for (const conn of connections) {
    try {
      const enq = await pollOneConnection(conn.id);
      jobsEnqueued += enq;
    } catch (err) {
      errors += 1;
      logger.warn({ connectionId: conn.id, err: (err as Error).message }, 'gmail.poll connection failed');
      await prisma.gmailConnection.update({
        where: { id: conn.id },
        data: { lastError: (err as Error).message.slice(0, 1000), lastErrorAt: new Date() },
      });
    }
  }

  return { connectionsChecked: connections.length, jobsEnqueued, errors };
}

async function pollOneConnection(connectionId: string): Promise<number> {
  const { client, historyId } = await authenticatedClient(connectionId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const messageIds = new Set<string>();

  if (historyId) {
    try {
      let pageToken: string | undefined;
      do {
        const r = await gmail.users.history.list({
          userId: 'me',
          startHistoryId: historyId,
          historyTypes: ['messageAdded'],
          pageToken,
        });
        for (const h of r.data.history ?? []) {
          for (const m of h.messagesAdded ?? []) {
            if (m.message?.id) {
              // Ignora drafts (são labelados como DRAFT)
              const labels = m.message.labelIds ?? [];
              if (labels.includes('DRAFT') || labels.includes('SENT')) continue;
              messageIds.add(m.message.id);
            }
          }
        }
        pageToken = r.data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (err) {
      // history expirado (>7 dias) → fallback para messages.list
      const msg = (err as Error).message;
      logger.info({ connectionId, err: msg }, 'gmail.poll history expired, falling back to messages.list');
      await fallbackList(gmail, messageIds);
    }
  } else {
    await fallbackList(gmail, messageIds);
  }

  let enqueued = 0;
  for (const mid of messageIds) {
    const r = await enqueue({
      type: 'gmail.ingest_message',
      payload: { connectionId, messageId: mid },
      dedupKey: `${connectionId}:${mid}`,
      organizationId: null, // resolvido no handler
    });
    if (!('dedup' in r)) enqueued += 1;
  }

  return enqueued;
}

async function fallbackList(
  gmail: ReturnType<typeof google.gmail>,
  out: Set<string>,
): Promise<void> {
  // Últimas 24h, ignora enviados, drafts, chats
  const r = await gmail.users.messages.list({
    userId: 'me',
    q: 'newer_than:1d -in:sent -in:drafts -in:chats',
    maxResults: 100,
  });
  for (const m of r.data.messages ?? []) {
    if (m.id) out.add(m.id);
  }
}
