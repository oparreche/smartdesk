import 'server-only';
import { z } from 'zod';
import { registerJobHandler } from '@/src/services/jobs/registry';
import { ingestMessage } from './ingest';
import { sendTicketMessageRouted } from '@/src/services/email/send-router';

const IngestPayload = z.object({
  connectionId: z.string().uuid(),
  messageId: z.string().min(1),
});

const SendPayload = z.object({
  ticketMessageId: z.string().uuid(),
});

registerJobHandler('gmail.ingest_message', async (raw) => {
  const payload = IngestPayload.parse(raw);
  return ingestMessage(payload);
});

registerJobHandler('email.send', async (raw) => {
  const payload = SendPayload.parse(raw);
  return sendTicketMessageRouted(payload);
});
