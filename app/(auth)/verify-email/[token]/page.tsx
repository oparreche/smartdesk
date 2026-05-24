import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '../../_layout-shell';
import { consumeVerifyToken, VerifyError } from '@/src/services/auth/email-verify';

export const metadata = { title: 'Confirmar email — SmartDesk' };

export default async function VerifyEmailPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;

  let success = false;
  let error: string | null = null;
  try {
    await consumeVerifyToken(token);
    success = true;
  } catch (err) {
    if (err instanceof VerifyError) {
      const msg: Record<string, string> = {
        invalid_token: 'Link inválido.',
        token_expired: 'Link expirado.',
        user_not_found: 'Usuário não encontrado.',
        email_mismatch: 'Email não corresponde.',
        already_verified: 'Email já confirmado anteriormente.',
      };
      error = msg[err.code] ?? 'Erro';
    } else {
      error = 'Erro inesperado';
    }
  }

  if (success) {
    redirect('/login?verified=ok');
  }

  return (
    <AuthShell
      eyebrow="Confirmação"
      title={
        <>
          Não foi <em className="font-display italic">desta vez</em>.
        </>
      }
      lead="O link de confirmação pode ter expirado ou já ter sido usado. Faça login e reenvie de dentro do painel."
    >
      <header className="mb-8">
        <p className="divider-eyebrow text-muted-foreground">Verificação</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">Link inválido</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </header>
      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
      >
        Voltar ao login
      </Link>
    </AuthShell>
  );
}
