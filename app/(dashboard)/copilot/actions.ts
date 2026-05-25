'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { runCopilotTurn, type Citation } from '@/src/services/copilot/run';

const TurnInput = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

export type TurnState =
  | { ok: true; assistantText: string; citations: Citation[]; conversationId: string }
  | { ok: false; error: string };

export async function askCopilotAction(
  _prev: TurnState | undefined,
  form: FormData,
): Promise<TurnState> {
  const ctx = await getOrgContext();
  const parsed = TurnInput.safeParse({
    conversationId: (form.get('conversationId') as string | null) || undefined,
    message: form.get('message'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Mensagem inválida' };
  }
  try {
    const r = await runCopilotTurn({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      conversationId: parsed.data.conversationId,
      message: parsed.data.message,
    });
    revalidatePath('/copilot');
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
