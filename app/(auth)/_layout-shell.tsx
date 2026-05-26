import Link from 'next/link';

/**
 * Shell editorial bipartido para páginas de auth (login/signup/accept).
 * Coluna esquerda: brand statement + texto serifa grande.
 * Coluna direita: formulário compacto.
 */
export function AuthShell({
  eyebrow,
  title,
  lead,
  children,
  footer,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen flex-1 grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* Hero editorial */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-primary px-12 py-10 text-primary-foreground lg:flex">
        {/* Textura sutil */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.6), transparent 35%), radial-gradient(circle at 75% 60%, rgba(255,255,255,0.4), transparent 40%)',
          }}
        />
        <header className="relative flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary-foreground text-primary">
            <span className="font-display text-lg font-semibold leading-none tracking-tight">S</span>
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">SmartDesk</span>
        </header>

        <div className="relative max-w-md space-y-6">
          <p className="divider-eyebrow text-primary-foreground/70">{eyebrow}</p>
          <h1 className="font-display text-[3.25rem] font-semibold leading-[1.02] tracking-[-0.03em]">
            {title}
          </h1>
          <p className="max-w-[28rem] text-[0.95rem] leading-relaxed text-primary-foreground/75">
            {lead}
          </p>
        </div>

        <footer className="relative text-xs text-primary-foreground/60">
          <p className="font-mono uppercase tracking-widest">SD — 2026</p>
          <p className="mt-1">
            O atendente abre o ticket e já vê todas as informações importantes do cliente.
          </p>
        </footer>
      </aside>

      {/* Form */}
      <main className="flex flex-col items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <span className="font-display text-base font-semibold leading-none">S</span>
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">SmartDesk</span>
          </div>

          {children}

          {footer ? (
            <div className="mt-8 border-t border-border pt-5 text-xs text-muted-foreground">
              {footer}
            </div>
          ) : null}

          <p className="mt-12 text-center text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <Link href="/" className="hover:text-foreground">↘ smartdesk.app</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
