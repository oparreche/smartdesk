import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/src/lib/prisma';
import { getPortalSession } from '@/src/services/portal/auth';
import { portalLogoutAction } from './actions';

export default async function PortalOrgLayout(props: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await props.params;
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug, deletedAt: null },
    select: { id: true, name: true, slug: true },
  });
  if (!org) notFound();

  const session = await getPortalSession();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link
            href={`/portal/${org.slug}`}
            className="flex items-center gap-2"
          >
            <span className="font-display text-lg font-semibold tracking-tight">
              {org.name}
            </span>
            <span className="rounded-sm border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
              Portal
            </span>
          </Link>
          {session && session.organizationSlug === org.slug ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {session.email}
              </span>
              <form action={portalLogoutAction}>
                <button
                  type="submit"
                  className="rounded-sm border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Sair
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{props.children}</main>
      <footer className="mx-auto max-w-4xl px-6 pb-8 pt-4 text-center text-[0.6875rem] text-muted-foreground">
        Portal SmartDesk · {org.name}
      </footer>
    </div>
  );
}

