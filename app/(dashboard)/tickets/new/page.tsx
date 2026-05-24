import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listQueues } from '@/src/services/queues';
import { NewTicketForm } from './new-ticket-form';

export const metadata = { title: 'Novo ticket — SmartDesk' };

export default async function NewTicketPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:create');

  const queues = await listQueues(ctx.organizationId);

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/tickets" className="text-muted-foreground hover:text-foreground hover:underline">
            Tickets
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">Novo</span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Abrir ticket manualmente
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Use quando o canal não está conectado ainda ou pra registrar um
          atendimento por telefone/presencial. Pra abertura externa, configure{' '}
          <Link href="/forms" className="text-primary hover:underline">
            formulários públicos
          </Link>
          .
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <NewTicketForm
          queues={queues.map((q) => ({
            id: q.id,
            name: q.name,
            isDefault: q.isDefault,
          }))}
        />

        <aside className="flex flex-col gap-4" data-anim="reveal" data-delay="2">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Como funciona</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Solicitante reutilizado
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Se o email, documento ou telefone já existir no SmartDesk, o
              ticket é vinculado ao mesmo solicitante — todo o histórico de
              chamados anteriores fica acessível.
            </p>
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Próximo passo</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Integrações disparam automaticamente
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Assim que criar, regras de automação{' '}
              <span className="font-mono text-foreground">ticket_created</span> e
              integrações com APIs externas rodam em segundo plano e enriquecem
              o ticket.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
