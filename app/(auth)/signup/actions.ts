'use server';

import { z } from 'zod';
import { signIn } from '@/auth';
import { signupOrganization, SignupConflictError } from '@/src/services/organizations/signup';
import { checkRateLimit } from '@/src/lib/rate-limit';
import { headers } from 'next/headers';
import { AuthError } from 'next-auth';

const Input = z.object({
  userName: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  organizationName: z.string().min(1).max(120),
});

export type SignupState = { ok: true } | { ok: false; error: string };

export async function signupAction(
  _prev: SignupState | undefined,
  form: FormData,
): Promise<SignupState> {
  // Rate-limit por IP — 5 signups/15min
  try {
    const h = await headers();
    const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim();
    const rl = await checkRateLimit({
      bucket: `signup:ip:${ip}`,
      windowSeconds: 15 * 60,
      max: 5,
    });
    if (!rl.allowed) {
      return { ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' };
    }
  } catch {
    /* sem headers — script direto, segue */
  }

  const parsed = Input.safeParse({
    userName: form.get('userName'),
    email: form.get('email'),
    password: form.get('password'),
    organizationName: form.get('organizationName'),
  });
  if (!parsed.success) {
    return { ok: false, error: 'Verifique os campos. Senha precisa ter ao menos 8 caracteres.' };
  }

  try {
    await signupOrganization(parsed.data);
  } catch (err) {
    if (err instanceof SignupConflictError) {
      if (err.field === 'email') return { ok: false, error: 'Já existe uma conta com este email.' };
      return { ok: false, error: 'Conflito ao criar organização. Tente novamente.' };
    }
    return { ok: false, error: (err as Error).message };
  }

  // Auto-login: cria sessão direto
  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/dashboard',
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: 'Conta criada mas autologin falhou. Faça login.' };
    }
    throw err; // NEXT_REDIRECT
  }
}
