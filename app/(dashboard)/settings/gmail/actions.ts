'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { disconnectConnection } from '@/src/services/gmail/oauth';

const DisconnectInput = z.object({ id: z.string().uuid() });

export async function disconnectGmailAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');

  const parsed = DisconnectInput.safeParse({ id: formData.get('id') });
  if (!parsed.success) return;

  await disconnectConnection(ctx.organizationId, ctx.userId, parsed.data.id);
  revalidatePath('/settings/gmail');
}
