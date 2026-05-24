'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { updateOrganization } from '@/src/services/organizations/update';

const NameInput = z.object({ name: z.string().min(1).max(160) });

export type OrgState = { ok: true; message: string } | { ok: false; error: string };

export async function updateOrgNameAction(
  _prev: OrgState | undefined,
  form: FormData,
): Promise<OrgState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');

  const parsed = NameInput.safeParse({ name: form.get('name') });
  if (!parsed.success) return { ok: false, error: 'Nome inválido.' };

  await updateOrganization(ctx.organizationId, ctx.userId, { name: parsed.data.name });
  revalidatePath('/settings/organization');
  return { ok: true, message: 'Nome atualizado.' };
}
