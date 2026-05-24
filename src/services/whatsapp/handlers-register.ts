import 'server-only';
import { z } from 'zod';
import { registerJobHandler } from '@/src/services/jobs/registry';
import { sendWhatsappMessage } from './send';

const SendPayload = z.object({
  ticketMessageId: z.string().uuid(),
});

registerJobHandler('whatsapp.send', async (raw) => {
  const payload = SendPayload.parse(raw);
  return sendWhatsappMessage(payload);
});
