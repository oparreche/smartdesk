'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Em prod: enviar para Sentry/etc.
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  const isForbidden = error.message?.startsWith('Missing permission:');

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-10 text-center">
      <h1 className="text-2xl font-semibold">
        {isForbidden ? 'Sem permissão' : 'Algo deu errado'}
      </h1>
      <p className="text-sm text-muted-foreground">
        {isForbidden
          ? 'Seu perfil não tem acesso a esta página. Fale com o administrador da organização.'
          : 'Tente novamente ou volte ao painel.'}
      </p>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Tentar novamente
        </button>
        <Link
          href="/dashboard"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Voltar ao painel
        </Link>
      </div>
    </div>
  );
}
