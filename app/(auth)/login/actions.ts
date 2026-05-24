'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Informe email e senha.' };
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/dashboard',
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.type === 'CredentialsSignin') {
        return { error: 'Email ou senha inválidos.' };
      }
      return { error: 'Falha ao autenticar.' };
    }
    // signIn dispara um throw "NEXT_REDIRECT" em caso de sucesso — repassar
    throw err;
  }
}
