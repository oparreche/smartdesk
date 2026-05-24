'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { updateProfile, changePassword, ProfileError } from '@/src/services/users/profile';

const NameInput = z.object({ name: z.string().min(1).max(120) });
const PasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export type ProfileState = { ok: true; message: string } | { ok: false; error: string };

export async function updateNameAction(
  _prev: ProfileState | undefined,
  form: FormData,
): Promise<ProfileState> {
  const ctx = await getOrgContext();
  const parsed = NameInput.safeParse({ name: form.get('name') });
  if (!parsed.success) return { ok: false, error: 'Nome inválido.' };
  await updateProfile(ctx.userId, ctx.organizationId, { name: parsed.data.name });
  revalidatePath('/settings/profile');
  return { ok: true, message: 'Nome atualizado.' };
}

export async function changePasswordAction(
  _prev: ProfileState | undefined,
  form: FormData,
): Promise<ProfileState> {
  const ctx = await getOrgContext();
  const parsed = PasswordInput.safeParse({
    currentPassword: form.get('currentPassword'),
    newPassword: form.get('newPassword'),
  });
  if (!parsed.success) return { ok: false, error: 'Senha nova precisa ter ao menos 8 caracteres.' };

  try {
    await changePassword(ctx.userId, ctx.organizationId, parsed.data);
    return { ok: true, message: 'Senha alterada.' };
  } catch (err) {
    if (err instanceof ProfileError) {
      if (err.code === 'bad_password') return { ok: false, error: 'Senha atual incorreta.' };
      if (err.code === 'weak_password') return { ok: false, error: 'Senha muito curta.' };
    }
    return { ok: false, error: (err as Error).message };
  }
}
