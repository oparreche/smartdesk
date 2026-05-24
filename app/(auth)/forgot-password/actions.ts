'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { requestPasswordReset } from '@/src/services/auth/password-reset';
import { checkRateLimit } from '@/src/lib/rate-limit';

const Input = z.object({ email: z.string().email() });

export type ForgotState = { ok: true } | { ok: false; error: string };

export async function forgotPasswordAction(
  _prev: ForgotState | undefined,
  form: FormData,
): Promise<ForgotState> {
  const parsed = Input.safeParse({ email: form.get('email') });
  if (!parsed.success) {
    // Mesma mensagem do sucesso pra não vazar
    return { ok: true };
  }

  try {
    const h = await headers();
    const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim();
    const rl = await checkRateLimit({
      bucket: `forgot:ip:${ip}`,
      windowSeconds: 15 * 60,
      max: 10,
    });
    if (!rl.allowed) {
      return { ok: false, error: 'Muitas tentativas. Tente novamente em alguns minutos.' };
    }
  } catch {
    /* sem headers — segue */
  }

  await requestPasswordReset(parsed.data.email);
  return { ok: true };
}
