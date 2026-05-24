import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { prisma } from '@/src/lib/prisma';
import { getOrgCsatStats } from '@/src/services/csat';
import {
  STATUS_LABEL,
  STATUS_BADGE,
  PRIORITY_LABEL,
  PRIORITY_BADGE,
  formatRelativeShort,
} from '@/src/lib/format';

export const metadata = { title: 'Dashboard — SmartDesk' };

export default async function DashboardPage() {
  const ctx = await getOrgContext();

  const [openTickets, totalTickets, myTickets, queues, recent, gmailConn, waConn, integrations, forms, members, layouts] = await prisma.$transaction([
    prisma.ticket.count({
      where: {
        organizationId: ctx.organizationId,
        deletedAt: null,
        status: { in: ['new', 'open', 'in_progress', 'pending_customer', 'pending_third_party'] },
      },
    }),
    prisma.ticket.count({ where: { organizationId: ctx.organizationId, deletedAt: null } }),
    prisma.ticket.count({
      where: {
        organizationId: ctx.organizationId,
        deletedAt: null,
        assigneeId: ctx.userId,
        status: { in: ['new', 'open', 'in_progress'] },
      },
    }),
    prisma.queue.count({ where: { organizationId: ctx.organizationId, deletedAt: null } }),
    prisma.ticket.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        code: true,
        subject: true,
        status: true,
        priority: true,
        updatedAt: true,
        requester: { select: { name: true, email: true } },
      },
    }),
    prisma.gmailConnection.count({ where: { organizationId: ctx.organizationId, status: 'active', deletedAt: null } }),
    prisma.whatsappConnection.count({ where: { organizationId: ctx.organizationId, status: 'active', deletedAt: null } }),
    prisma.apiIntegration.count({ where: { organizationId: ctx.organizationId, deletedAt: null } }),
    prisma.form.count({ where: { organizationId: ctx.organizationId, isPublished: true, deletedAt: null } }),
    prisma.organizationUser.count({ where: { organizationId: ctx.organizationId, status: 'active' } }),
    prisma.ticketLayout.count({ where: { organizationId: ctx.organizationId, deletedAt: null } }),
  ]);

  const csat = await getOrgCsatStats(ctx.organizationId, 30);

  const greeting = pickGreeting();
  const firstName = ctx.name.split(/\s+/)[0];
  const now = new Date();

  const showOnboarding = totalTickets === 0;

  return (
    <div className="flex w-full flex-col gap-10 px-8 py-10">
      {/* Hero editorial */}
      <header data-anim="reveal" className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div>
          <p className="divider-eyebrow text-muted-foreground">
            {todayLine()}
          </p>
          <h1 className="mt-3 font-display text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.02em]">
            {greeting},{' '}
            <em className="font-display italic text-primary">{firstName}</em>.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Operação de <span className="font-medium text-foreground">{ctx.organizationName}</span>.{' '}
            Tudo o que importa hoje em uma tela.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Link
            href="/tickets/new"
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px"
          >
            Novo ticket
            <span aria-hidden className="font-mono text-xs">＋</span>
          </Link>
          <Link
            href="/integrations/new"
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Nova integração
          </Link>
        </div>
      </header>

      {showOnboarding ? (
        <OnboardingChecklist
          steps={[
            {
              key: 'channel',
              eyebrow: '01',
              title: 'Conecte um canal',
              description: 'Receba tickets por email (Gmail) ou WhatsApp. É de onde a maioria dos clientes começa.',
              done: gmailConn > 0 || waConn > 0,
              cta: gmailConn > 0 || waConn > 0 ? 'Gerenciar canais' : 'Conectar canal',
              href: gmailConn === 0 ? '/settings/gmail' : '/settings/whatsapp',
            },
            {
              key: 'form',
              eyebrow: '02',
              title: 'Publique um formulário',
              description: 'Cole o snippet no seu site e capture chamados estruturados — campos, prioridades, fila destino.',
              done: forms > 0,
              cta: forms > 0 ? 'Ver formulários' : 'Criar formulário',
              href: '/forms',
            },
            {
              key: 'integration',
              eyebrow: '03',
              title: 'Conecte uma API interna',
              description: 'Enriqueça cada ticket com dados do seu ERP/CRM. JSONPath, header de auth, condições — sem código.',
              done: integrations > 0,
              cta: integrations > 0 ? 'Ver integrações' : 'Nova integração',
              href: '/integrations',
            },
            {
              key: 'layout',
              eyebrow: '04',
              title: 'Desenhe o Painel Inteligente',
              description: 'Escolha que blocos aparecem ao lado do ticket — dados do cliente, alertas, links externos.',
              done: layouts > 0,
              cta: layouts > 0 ? 'Editar painel' : 'Criar painel',
              href: '/layouts',
            },
            {
              key: 'team',
              eyebrow: '05',
              title: 'Convide o time',
              description: 'Adicione atendentes e admins. Cada um com permissões granulares por papel.',
              done: members > 1,
              cta: members > 1 ? 'Gerenciar time' : 'Convidar atendentes',
              href: '/settings/users',
            },
          ]}
          firstName={firstName}
        />
      ) : null}

      {/* Métricas */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
        <MetricCell label="Em aberto" value={openTickets} delay={1} accent="primary" />
        <MetricCell label="Meus em andamento" value={myTickets} delay={2} accent="accent" />
        <MetricCell label="Total histórico" value={totalTickets} delay={3} />
        <MetricCell label="Filas ativas" value={queues} delay={4} />
      </section>

      {/* CSAT (últimos 30 dias) */}
      {csat.total > 0 ? (
        <section
          data-anim="reveal"
          data-delay="2"
          className="card flex flex-col gap-4 p-5"
        >
          <header className="flex items-baseline justify-between gap-3">
            <div>
              <p className="divider-eyebrow text-muted-foreground">
                Satisfação · últimos 30 dias
              </p>
              <h2 className="mt-1 font-display text-xl font-medium tracking-tight">
                CSAT médio
              </h2>
            </div>
            <div className="text-right">
              {csat.avgRating ? (
                <p className="numeral-serif text-4xl font-medium text-primary">
                  {csat.avgRating.toFixed(1)}
                  <span className="text-base text-muted-foreground">/5</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">sem respostas ainda</p>
              )}
              <p className="text-[0.6875rem] text-muted-foreground">
                {csat.responded}/{csat.total} responderam · {Math.round(csat.responseRate * 100)}%
              </p>
            </div>
          </header>

          {csat.responded > 0 ? (
            <>
              <div className="grid grid-cols-5 gap-2">
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = csat.distribution[n as 1 | 2 | 3 | 4 | 5];
                  const pct = csat.responded > 0 ? count / csat.responded : 0;
                  const emoji = ['😡', '😞', '😐', '🙂', '🤩'][n - 1];
                  return (
                    <div key={n} className="flex flex-col items-center gap-1">
                      <div className="relative flex h-16 w-full items-end overflow-hidden rounded-sm bg-muted/30">
                        <div
                          className="w-full bg-primary transition-[height]"
                          style={{ height: `${Math.max(pct * 100, 3)}%` }}
                        />
                      </div>
                      <span className="text-base">{emoji}</span>
                      <span className="numeral-serif text-xs font-medium text-foreground">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>

              {csat.recent.length > 0 ? (
                <div>
                  <p className="divider-eyebrow mb-2 text-muted-foreground">
                    Últimos comentários
                  </p>
                  <ul className="flex flex-col gap-2">
                    {csat.recent.slice(0, 3).map((r) => (
                      <li
                        key={r.id}
                        className="rounded-sm border border-border bg-surface-raised p-3"
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs">
                          <span className="text-base">
                            {['😡', '😞', '😐', '🙂', '🤩'][r.rating - 1]}
                          </span>
                          <Link
                            href={`/tickets/${r.ticketCode}`}
                            className="numeral-serif font-medium text-primary hover:underline"
                          >
                            {r.ticketCode}
                          </Link>
                          <span className="text-muted-foreground">
                            · {formatRelativeShort(r.submittedAt, now)}
                          </span>
                        </div>
                        {r.comment ? (
                          <p className="text-xs leading-relaxed text-foreground-secondary">
                            “{r.comment}”
                          </p>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">
                            sem comentário
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {/* Lista recente + atalhos */}
      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="card overflow-hidden" data-anim="reveal" data-delay="2">
          <header className="flex items-baseline justify-between border-b border-border px-5 py-3">
            <h2 className="font-display text-lg font-medium tracking-tight">
              Tickets recentes
            </h2>
            <Link href="/tickets" className="text-xs text-muted-foreground hover:text-primary hover:underline">
              ver todos →
            </Link>
          </header>
          {recent.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              Nada por aqui ainda. <Link href="/tickets/new" className="text-primary hover:underline">Crie o primeiro ticket</Link>.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((t) => {
                const sb = STATUS_BADGE[t.status];
                const pb = PRIORITY_BADGE[t.priority];
                return (
                  <li key={t.id}>
                    <Link
                      href={`/tickets/${t.code}`}
                      className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                    >
                      <span className="numeral-serif w-20 shrink-0 text-[0.8125rem] font-medium text-primary">
                        {t.code.replace('HELP-', '#')}
                      </span>
                      <span className="flex-1 truncate text-sm group-hover:underline">
                        {t.subject}
                      </span>
                      <span
                        className="pill shrink-0"
                        style={{ backgroundColor: sb.bg, color: sb.fg }}
                      >
                        {STATUS_LABEL[t.status]}
                      </span>
                      <span
                        className="pill hidden shrink-0 sm:inline-flex"
                        style={{ backgroundColor: pb.bg, color: pb.fg }}
                      >
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                      <span className="w-12 shrink-0 text-right text-[0.6875rem] text-muted-foreground">
                        {formatRelativeShort(t.updatedAt, now)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="flex flex-col gap-3" data-anim="reveal" data-delay="3">
          <ShortcutCard
            eyebrow="Diferencial"
            title="Painel Inteligente"
            description="Configure o que o atendente vê antes de responder."
            href="/layouts"
          />
          <ShortcutCard
            eyebrow="Automação"
            title="Regras"
            description="Aplique prioridade, tag e fila automaticamente."
            href="/rules"
          />
          <ShortcutCard
            eyebrow="Integrações"
            title="APIs externas"
            description="Plugue as APIs internas da sua empresa."
            href="/integrations"
          />
        </aside>
      </section>
    </div>
  );
}

function MetricCell({
  label,
  value,
  delay,
  accent,
}: {
  label: string;
  value: number;
  delay?: 1 | 2 | 3 | 4;
  accent?: 'primary' | 'accent';
}) {
  return (
    <div
      data-anim="reveal"
      data-delay={delay}
      className="bg-surface px-5 py-5 transition-colors hover:bg-surface-raised"
    >
      <p className="divider-eyebrow text-muted-foreground">{label}</p>
      <p
        className={`numeral-serif mt-3 text-[2.75rem] font-medium leading-none tracking-tight ${
          accent === 'primary'
            ? 'text-primary'
            : accent === 'accent'
              ? 'text-accent'
              : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ShortcutCard({
  eyebrow,
  title,
  description,
  href,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="card group block p-4 transition-all hover:-translate-y-px hover:shadow-md"
    >
      <p className="divider-eyebrow text-muted-foreground">{eyebrow}</p>
      <h3 className="mt-1.5 font-display text-base font-medium tracking-tight">
        {title} <span aria-hidden className="text-primary transition-transform group-hover:translate-x-0.5">→</span>
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </Link>
  );
}

type OnboardingStep = {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  done: boolean;
  cta: string;
  href: string;
};

function OnboardingChecklist({ steps, firstName }: { steps: OnboardingStep[]; firstName: string }) {
  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const percent = Math.round((completed / total) * 100);
  const nextStep = steps.find((s) => !s.done) ?? steps[0];

  return (
    <section
      data-anim="reveal"
      data-delay="1"
      className="relative overflow-hidden rounded-md border border-border bg-surface p-0 shadow-xs"
    >
      <div className="absolute inset-0 -z-0 opacity-[0.07]">
        <svg width="100%" height="100%" aria-hidden>
          <defs>
            <pattern id="onboard-dots" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#onboard-dots)" />
        </svg>
      </div>

      <div className="relative z-10 grid gap-0 lg:grid-cols-[1.1fr_1.4fr]">
        {/* Coluna esquerda — hero do onboarding */}
        <div className="border-b border-border bg-primary p-7 text-primary-foreground lg:border-b-0 lg:border-r">
          <p className="divider-eyebrow text-primary-foreground/60">Bem-vindo, {firstName}</p>
          <h2 className="mt-3 font-display text-[1.875rem] font-medium leading-[1.1] tracking-tight">
            Vamos preparar sua{' '}
            <em className="italic text-accent">central de atendimento</em>{' '}
            em 5 passos.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-primary-foreground/80">
            Cada passo conecta o SmartDesk ao seu fluxo real — canais, formulários, dados internos, layout e time.
          </p>

          <div className="mt-7">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-primary-foreground/60">Progresso</span>
              <span className="numeral-serif text-base font-medium text-accent">
                {completed}<span className="text-primary-foreground/40">/{total}</span>
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-primary-foreground/10">
              <div
                className="h-full bg-accent transition-[width] duration-700"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {nextStep && !nextStep.done ? (
            <Link
              href={nextStep.href}
              className="mt-6 inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px"
            >
              {nextStep.cta}
              <span aria-hidden className="font-mono text-xs">→</span>
            </Link>
          ) : completed === total ? (
            <p className="mt-6 text-sm text-accent">Tudo pronto. Bora atender.</p>
          ) : null}
        </div>

        {/* Coluna direita — checklist */}
        <ol className="divide-y divide-border">
          {steps.map((step) => (
            <li key={step.key}>
              <Link
                href={step.href}
                className="group flex items-start gap-4 px-6 py-4 transition-colors hover:bg-muted/40"
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                    step.done
                      ? 'border-success bg-success text-success-soft'
                      : 'border-border bg-surface-raised text-muted-foreground'
                  }`}
                  aria-hidden
                >
                  {step.done ? '✓' : <span className="numeral-serif">{step.eyebrow}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3
                      className={`font-display text-base font-medium tracking-tight ${
                        step.done ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {step.title}
                    </h3>
                    <span className="shrink-0 font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {step.cta} →
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function pickGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function todayLine(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date());
}
