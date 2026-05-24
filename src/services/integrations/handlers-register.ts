import 'server-only';
import { z } from 'zod';
import { registerJobHandler } from '@/src/services/jobs/registry';
import { runIntegration } from './run';

const RunPayload = z.object({
  organizationId: z.string().uuid(),
  integrationId: z.string().uuid(),
  ticketId: z.string().uuid().nullable(),
  triggeredBy: z.string(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

registerJobHandler('integration.run', async (raw) => {
  const payload = RunPayload.parse(raw);
  return runIntegration(payload);
});
