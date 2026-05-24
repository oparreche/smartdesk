'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { inviteMember, InviteError, changeMemberRole, removeMember } from '@/src/services/organizations/invites';

const InviteInput = z.object({
  email: z.string().email().max(200),
  role: z.enum(['admin', 'supervisor', 'agent', 'viewer']),
});

export type InviteState = { ok: true; inviteUrl: string } | { ok: false; error: string };

export async function inviteAction(
  _prev: InviteState | undefined,
  form: FormData,
): Promise<InviteState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'users:manage');

  const parsed = InviteInput.safeParse({
    email: form.get('email'),
    role: form.get('role'),
  });
  if (!parsed.success) return { ok: false, error: 'Dados inválidos' };

  try {
    const r = await inviteMember({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      email: parsed.data.email,
      role: parsed.data.role,
    });
    revalidatePath('/settings/users');
    return { ok: true, inviteUrl: r.inviteUrl };
  } catch (err) {
    if (err instanceof InviteError) {
      if (err.code === 'already_member') return { ok: false, error: 'Este email já é membro.' };
      return { ok: false, error: err.message };
    }
    return { ok: false, error: (err as Error).message };
  }
}

const RoleInput = z.object({
  id: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'supervisor', 'agent', 'viewer']),
});

export async function changeRoleAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'users:manage');

  const parsed = RoleInput.parse({ id: form.get('id'), role: form.get('role') });
  await changeMemberRole(ctx.organizationId, ctx.userId, parsed.id, parsed.role);
  revalidatePath('/settings/users');
}

const RemoveInput = z.object({ id: z.string().uuid() });

export async function removeMemberAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'users:manage');

  const parsed = RemoveInput.parse({ id: form.get('id') });
  await removeMember(ctx.organizationId, ctx.userId, parsed.id);
  revalidatePath('/settings/users');
}
