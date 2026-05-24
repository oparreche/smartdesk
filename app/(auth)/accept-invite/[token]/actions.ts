'use server';

import { z } from 'zod';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { acceptInvite, InviteError } from '@/src/services/organizations/invites';

const Input = z.object({
  token: z.string().min(10),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});

export type AcceptState = { ok: true } | { ok: false; error: string };

export async function acceptInviteAction(
  _prev: AcceptState | undefined,
  form: FormData,
): Promise<AcceptState> {
  const parsed = Input.safeParse({
    token: form.get('token'),
    name: form.get('name'),
    password: form.get('password'),
  });
  if (!parsed.success) return { ok: false, error: 'Verifique os campos.' };

  let email: string;
  try {
    const r = await acceptInvite(parsed.data);
    // Reread token for email
    const { decodeInviteToken } = await import('@/src/services/organizations/invites');
    const p = decodeInviteToken(parsed.data.token);
    if (!p) return { ok: false, error: 'Convite inválido' };
    email = p.email;
    void r;
  } catch (err) {
    if (err instanceof InviteError) {
      if (err.code === 'already_member') return { ok: false, error: 'Você já é membro desta organização.' };
      if (err.code === 'invalid') return { ok: false, error: 'Convite inválido ou expirado.' };
      return { ok: false, error: err.message };
    }
    return { ok: false, error: (err as Error).message };
  }

  try {
    await signIn('credentials', {
      email,
      password: parsed.data.password,
      redirectTo: '/dashboard',
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: 'Conta criada. Faça login manualmente.' };
    }
    throw err; // NEXT_REDIRECT
  }
}
