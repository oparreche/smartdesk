import Link from 'next/link';
import { AuthShell } from '../_layout-shell';
import { ForgotForm } from './forgot-form';

export const metadata = { title: 'Recuperar senha — SmartDesk' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Recuperação"
      title={
        <>
          Voltou pra <em className="font-display italic">cá</em>. Vamos abrir a porta pra você.
        </>
      }
      lead="Informe o email da sua conta e mandamos um link com validade de 1 hora pra você definir uma senha nova."
      footer={
        <>
          Lembrou a senha?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Voltar pro login
          </Link>
        </>
      }
    >
      <header className="mb-8">
        <p className="divider-eyebrow text-muted-foreground">Recuperar acesso</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">Esqueci a senha</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Vamos te enviar um link. O link expira em 1 hora.
        </p>
      </header>
      <ForgotForm />
    </AuthShell>
  );
}
