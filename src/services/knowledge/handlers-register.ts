import 'server-only';
import { registerJobHandler } from '@/src/services/jobs/registry';
import { indexSource } from './index-source';

registerJobHandler('knowledge.index_source', async (raw) => {
  const payload = raw as { sourceId: string };
  if (!payload?.sourceId) throw new Error('missing sourceId');
  return indexSource(payload.sourceId);
});
