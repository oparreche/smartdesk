'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { consumeResetToken, PasswordResetError } from '@/src/services/auth/password-reset';

const Input = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export type ResetState = { ok: true } | { ok: false; error: string };

export async function resetPasswordAction(
  _prev: ResetState | undefined,
  form: FormData,
): Promise<ResetState> {
  const parsed = Input.safeParse({
    token: form.get('token'),
    password: form.get('password'),
  });
  if (!parsed.success) return { ok: false, error: 'Senha precisa ter ao menos 8 caracteres.' };

  try {
    await consumeResetToken(parsed.data.token, parsed.data.password);
  } catch (err) {
    if (err instanceof PasswordResetError) {
      const msg: Record<string, string> = {
        invalid_token: 'Link inválido ou já usado.',
        token_expired: 'Link expirado. Solicite um novo.',
        weak_password: 'Senha muito curta.',
        user_not_found: 'Usuário não existe.',
      };
      return { ok: false, error: msg[err.code] ?? err.code };
    }
    return { ok: false, error: 'Erro inesperado.' };
  }

  redirect('/login?reset=ok');
}
