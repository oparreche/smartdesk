import Link from 'next/link';
import { AuthShell } from '../../_layout-shell';
import { decodeResetToken } from '@/src/services/auth/password-reset';
import { ResetForm } from './reset-form';

export const metadata = { title: 'Redefinir senha — SmartDesk' };

export default async function ResetPasswordPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const payload = decodeResetToken(token);

  if (!payload) {
    return (
      <AuthShell
        eyebrow="Recuperação"
        title={
          <>
            Esse link <em className="font-display italic">expirou</em>.
          </>
        }
        lead="Links de recuperação são válidos por 1 hora e funcionam só uma vez. Solicite um novo abaixo."
      >
        <header className="mb-8">
          <p className="divider-eyebrow text-muted-foreground">Link inválido</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">Link inválido</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pode ter expirado, já sido usado ou alguém pode ter manipulado a URL.
          </p>
        </header>
        <Link
          href="/forgot-password"
          className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
        >
          Solicitar novo link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Recuperação"
      title={
        <>
          Quase lá. Defina sua <em className="font-display italic">nova senha</em>.
        </>
      }
      lead="Mínimo de 8 caracteres. Depois você é redirecionado pro login."
      footer={
        <Link href="/login" className="text-muted-foreground hover:text-foreground hover:underline">
          ← Cancelar e voltar ao login
        </Link>
      }
    >
      <header className="mb-8">
        <p className="divider-eyebrow text-muted-foreground">Nova senha</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">Definir senha</h2>
      </header>
      <ResetForm token={token} email={payload.emailLower} />
    </AuthShell>
  );
}
