import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Portal de atendimento — SmartDesk' };

export default function PortalIndex(props: {
  searchParams?: Promise<{ slug?: string }>;
}) {
  async function go(formData: FormData) {
    'use server';
    const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
    if (slug) redirect(`/portal/${slug}`);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
      <div className="w-full">
        <header className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Portal de atendimento
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Informe o identificador da organização que você quer acessar.
          </p>
        </header>

        <form action={go} className="card flex flex-col gap-4 p-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground-secondary">
              Slug da organização
            </span>
            <input
              name="slug"
              required
              placeholder="ex: minha-empresa"
              className="rounded-sm border border-border bg-surface-raised px-3 py-2 font-mono text-sm shadow-xs outline-none focus:border-primary focus:bg-background"
            />
            <span className="text-[0.6875rem] text-muted-foreground">
              É o nome curto da empresa na URL (ex: <code className="font-mono">acme</code>).
            </span>
          </label>

          <button
            type="submit"
            className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
          >
            Acessar
          </button>
        </form>

        <p className="mt-4 text-center text-[0.6875rem] text-muted-foreground">
          Atendente?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Entre no painel
          </Link>
        </p>
      </div>
    </div>
  );
}
