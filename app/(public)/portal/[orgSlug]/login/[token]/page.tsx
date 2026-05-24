import Link from 'next/link';
import { redirect } from 'next/navigation';
import { consumeMagicLink } from '@/src/services/portal/auth';

export const dynamic = 'force-dynamic';

export default async function PortalLoginPage(props: {
  params: Promise<{ orgSlug: string; token: string }>;
}) {
  const { orgSlug, token } = await props.params;

  const result = await consumeMagicLink(token);
  if (result.ok) {
    redirect(`/portal/${result.orgSlug}`);
  }

  const reasons: Record<string, string> = {
    invalid_or_expired: 'Esse link é inválido ou expirou (validade de 30 minutos).',
    org_not_found: 'Organização não encontrada.',
    requester_not_found: 'Email não encontrado.',
  };

  return (
    <div className="mx-auto max-w-md text-center">
      <div className="text-4xl">⏳</div>
      <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">
        Link inválido
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {reasons[result.reason] ?? 'Não conseguimos validar esse link.'}
      </p>
      <Link
        href={`/portal/${orgSlug}`}
        className="mt-6 inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
      >
        Pedir novo link
      </Link>
    </div>
  );
}
