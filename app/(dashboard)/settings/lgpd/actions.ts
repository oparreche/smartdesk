'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { anonymizeRequester } from '@/src/services/requesters/anonymize';

const Input = z.object({
  id: z.string().uuid(),
  confirm: z.literal('ANONIMIZAR'),
});

export type LgpdState = { ok: true; message: string } | { ok: false; error: string };

export async function anonymizeAction(
  _prev: LgpdState | undefined,
  form: FormData,
): Promise<LgpdState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage'); // só owner/admin

  const parsed = Input.safeParse({
    id: form.get('id'),
    confirm: form.get('confirm'),
  });
  if (!parsed.success) {
    return { ok: false, error: 'Confirme digitando ANONIMIZAR.' };
  }

  try {
    const r = await anonymizeRequester(ctx.organizationId, ctx.userId, parsed.data.id);
    revalidatePath('/settings/lgpd');
    return {
      ok: true,
      message: `Anonimizado. ${r.ticketCount} ticket(s) preservados, ${r.messageCount} mensagem(ns) sanitizadas.`,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
