import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOrgContextOrNull } from '@/src/lib/tenant';
import { LoginForm } from './login-form';
import { AuthShell } from '../_layout-shell';

export const metadata = { title: 'Entrar — SmartDesk' };

export default async function LoginPage(props: {
  searchParams: Promise<{ reset?: string; verified?: string }>;
}) {
  const ctx = await getOrgContextOrNull();
  if (ctx) redirect('/dashboard');

  const { reset, verified } = await props.searchParams;

  return (
    <AuthShell
      eyebrow="Workspace · helpdesk"
      title={
        <>
          Atendimento que <em className="font-display italic">vê o cliente</em> antes de você
          digitar.
        </>
      }
      lead="SmartDesk junta Gmail, formulários e dados das suas APIs internas numa única tela de atendimento. Sem alternar 7 abas pra fechar um chamado."
      footer={
        <>
          Novo no SmartDesk?{' '}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            Criar conta
          </Link>
          <p className="mt-2 text-muted-foreground">
            Em dev: <code className="font-mono">admin@demo.local</code> ·{' '}
            <code className="font-mono">admin123</code>
          </p>
        </>
      }
    >
      <header className="mb-8">
        <p className="divider-eyebrow text-muted-foreground">Acesso</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">Entrar</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Use suas credenciais. Sem domínio? Crie uma conta nova.
        </p>
      </header>

      {reset === 'ok' ? (
        <div className="mb-4 rounded-sm border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
          Senha atualizada. Entre com a nova senha.
        </div>
      ) : null}
      {verified === 'ok' ? (
        <div className="mb-4 rounded-sm border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
          Email confirmado com sucesso.
        </div>
      ) : null}

      <LoginForm />
      <p className="mt-3 text-center text-xs">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground hover:underline">
          Esqueci a senha
        </Link>
      </p>
    </AuthShell>
  );
}
