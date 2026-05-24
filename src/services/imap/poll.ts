import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { pollConnection, type IngestImapResult } from './ingest';

export async function pollAllConnections(): Promise<{
  total: number;
  results: IngestImapResult[];
}> {
  const conns = await prisma.imapSmtpConnection.findMany({
    where: { status: 'active', deletedAt: null },
    select: { id: true },
  });

  const results: IngestImapResult[] = [];
  for (const c of conns) {
    try {
      const r = await pollConnection(c.id);
      results.push(r);
    } catch (err) {
      logger.warn({ err, connectionId: c.id }, 'imap.poll connection failed');
      results.push({
        connectionId: c.id,
        fetched: 0,
        ingested: 0,
        skipped: 0,
        failed: 0,
        errors: [{ uid: 0, reason: (err as Error).message }],
      });
    }
  }

  return { total: conns.length, results };
}
