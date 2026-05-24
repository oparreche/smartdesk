'use server';

import { z } from 'zod';
import { voteHelpful } from '@/src/services/kb';

const Input = z.object({
  articleId: z.string().uuid(),
  helpful: z.boolean(),
});

export async function voteHelpfulAction(input: z.infer<typeof Input>): Promise<void> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return;
  await voteHelpful(parsed.data.articleId, parsed.data.helpful);
}
