import { notFound } from 'next/navigation';
import { decodeInviteToken } from '@/src/services/organizations/invites';
import { prisma } from '@/src/lib/prisma';
import { AcceptForm } from './accept-form';

export const metadata = { title: 'Aceitar convite — SmartDesk' };

export default async function AcceptInvitePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const payload = decodeInviteToken(token);

  if (!payload) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Convite inválido</h1>
        <p className="text-sm text-muted-foreground">
          O link de convite é inválido ou expirou. Peça um novo ao administrador da organização.
        </p>
      </div>
    );
  }

  const org = await prisma.organization.findFirst({
    where: { id: payload.organizationId, deletedAt: null, status: 'active' },
    select: { id: true, name: true },
  });
  if (!org) notFound();

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-8 shadow-sm">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">SmartDesk</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aceitar convite</p>
        </header>
        <AcceptForm
          token={token}
          email={payload.email}
          role={payload.role}
          organizationName={org.name}
        />
      </div>
    </div>
  );
}
