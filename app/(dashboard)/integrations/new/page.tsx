import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { IntegrationForm } from '../integration-form';

export const metadata = { title: 'Nova integração — SmartDesk' };

export default async function NewIntegrationPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'integrations:write');

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
      <header className="border-b border-border pb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/integrations" className="hover:text-foreground hover:underline">Integrações</Link>
          <span>/</span>
          <span>Nova</span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Nova integração</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Configure uma chamada HTTP. Use <code className="font-mono text-foreground">{'{{ticket.requester.email}}'}</code> e variáveis no URL/body.
        </p>
      </header>
      <IntegrationForm mode="create" />
    </div>
  );
}
