import 'server-only';
import { registerJobHandler } from '@/src/services/jobs/registry';
import { deliverWebhook } from './index';

registerJobHandler('webhook.deliver', async (raw) => {
  return deliverWebhook(raw);
});
