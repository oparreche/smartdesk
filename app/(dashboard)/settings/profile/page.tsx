import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { prisma } from '@/src/lib/prisma';
import { NameForm, PasswordForm } from './profile-forms';

export const metadata = { title: 'Meu perfil — SmartDesk' };

export default async function ProfilePage() {
  const ctx = await getOrgContext();
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { name: true, email: true, lastLoginAt: true, emailVerifiedAt: true, createdAt: true },
  });
  if (!user) throw new Error('user_not_found');

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            SmartDesk
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            Meu perfil
          </span>
        </div>
        <div className="flex items-center gap-5">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border-strong bg-primary text-xl font-medium text-primary-foreground">
            {initials || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
              {user.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono text-foreground-secondary">{user.email}</span>
              <span
                className={`pill ${
                  user.emailVerifiedAt
                    ? 'bg-success-soft text-success'
                    : 'bg-warning-soft text-warning'
                }`}
              >
                {user.emailVerifiedAt ? '✓ verificado' : '⚠ não verificado'}
              </span>
              {user.lastLoginAt ? (
                <span>
                  · último login{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(user.lastLoginAt)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <NameForm initialName={user.name} />
          <PasswordForm />
        </div>

        <aside className="flex flex-col gap-4" data-anim="reveal" data-delay="2">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Conta</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Dados básicos
            </h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate font-mono text-foreground">{user.email}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Criado em</dt>
                <dd className="numeral-serif text-foreground">
                  {new Intl.DateTimeFormat('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  }).format(user.createdAt)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Papel atual</dt>
                <dd className="font-mono text-foreground">{ctx.role}</dd>
              </div>
            </dl>
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Dica de segurança</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Use uma senha forte
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Mínimo 8 caracteres, mas idealmente uma frase de 4+ palavras —
              fácil de lembrar e difícil de quebrar.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
