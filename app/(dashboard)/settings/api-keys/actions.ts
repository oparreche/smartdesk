'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { createKey, revokeKey, ALL_SCOPES, type ApiScope } from '@/src/services/api-keys';

const CreateInput = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string()).min(1),
  expiresInDays: z.coerce.number().int().min(0).max(3650).optional(),
});

export type KeyState =
  | { ok: true; id: string; rawKey: string; prefix: string }
  | { ok: false; error: string }
  | undefined;

export async function createKeyAction(
  _prev: KeyState,
  form: FormData,
): Promise<KeyState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');

  const scopes = form.getAll('scopes').map(String);
  const exp = form.get('expiresInDays');
  const parsed = CreateInput.safeParse({
    name: form.get('name'),
    scopes,
    expiresInDays: exp && exp !== '' ? exp : undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Inválido' };

  try {
    const validScopes = parsed.data.scopes.filter((s) =>
      (ALL_SCOPES as string[]).includes(s),
    ) as ApiScope[];
    const r = await createKey(ctx.organizationId, ctx.userId, {
      name: parsed.data.name,
      scopes: validScopes,
      expiresInDays: parsed.data.expiresInDays || undefined,
    });
    revalidatePath('/settings/api-keys');
    return { ok: true, id: r.id, rawKey: r.rawKey, prefix: r.prefix };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function revokeKeyAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');
  const id = String(form.get('id') ?? '');
  if (!id) return;
  try {
    await revokeKey(ctx.organizationId, ctx.userId, id);
  } catch {
    /* noop */
  }
  revalidatePath('/settings/api-keys');
}
