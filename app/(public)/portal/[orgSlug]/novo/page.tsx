import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalSession } from '@/src/services/portal/auth';
import { NewPortalTicketForm } from './new-form';

export const metadata = { title: 'Abrir chamado' };

export default async function PortalNewTicketPage(props: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await props.params;
  const session = await getPortalSession();
  if (!session || session.organizationSlug !== orgSlug) {
    redirect(`/portal/${orgSlug}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href={`/portal/${orgSlug}`}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          ← voltar
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
          Abrir novo chamado
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conte resumidamente o que aconteceu. Você receberá atualizações por email.
        </p>
      </div>

      <div className="card p-6">
        <NewPortalTicketForm orgSlug={orgSlug} />
      </div>
    </div>
  );
}
