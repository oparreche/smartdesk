import Link from 'next/link';
import { getPublishedFormBySlug } from '@/src/services/forms';

export const metadata = { title: 'Solicitação recebida' };

export default async function FormSuccessPage(props: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await props.params;
  const form = await getPublishedFormBySlug(slug);

  const message =
    form?.successMessage?.trim() ||
    'Recebemos sua solicitação. Em breve nossa equipe entrará em contato.';

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-7 px-5 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>

      <div className="space-y-3">
        <p className="divider-eyebrow text-muted-foreground">Tudo certo</p>
        <h1 className="font-display text-[2.25rem] font-semibold leading-tight tracking-tight">
          Solicitação recebida
        </h1>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">{message}</p>
      </div>

      <div className="rounded-md border border-border bg-surface px-6 py-4 shadow-xs">
        <p className="divider-eyebrow text-muted-foreground">Código do chamado</p>
        <p className="numeral-serif mt-2 text-2xl font-semibold text-primary">{code}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Guarde este código para acompanhar sua solicitação.
      </p>

      <Link
        href={`/f/${slug}`}
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        ← Voltar ao formulário
      </Link>
    </div>
  );
}
