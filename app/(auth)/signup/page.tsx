import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOrgContextOrNull } from '@/src/lib/tenant';
import { SignupForm } from './signup-form';
import { AuthShell } from '../_layout-shell';

export const metadata = { title: 'Criar conta — SmartDesk' };

export default async function SignupPage() {
  const ctx = await getOrgContextOrNull();
  if (ctx) redirect('/dashboard');

  return (
    <AuthShell
      eyebrow="Comece agora · trial"
      title={
        <>
          Sua próxima <em className="font-display italic">operação de atendimento</em> começa em 60 segundos.
        </>
      }
      lead="Crie sua organização, conecte um Gmail, cadastre a primeira integração HTTP e veja o painel ganhar contexto sozinho."
      footer={
        <>
          Já tem conta?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <header className="mb-8">
        <p className="divider-eyebrow text-muted-foreground">Onboarding</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          Crie sua organização
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Você vira owner. Convide a equipe depois.
        </p>
      </header>
      <SignupForm />
    </AuthShell>
  );
}
