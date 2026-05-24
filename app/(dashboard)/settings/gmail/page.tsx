import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { env } from '@/src/lib/env';
import { formatDateTime } from '@/src/lib/format';
import { disconnectGmailAction } from './actions';
import { listRules } from '@/src/services/gmail/routing';
import { RoutingSection, type RoutingRule } from './routing-section';

export const metadata = { title: 'Gmail — SmartDesk' };

const isOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GMAIL_REDIRECT_URI);

export default async function GmailSettingsPage(props: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');

  const { connected, error } = await props.searchParams;

  const routingRulesRaw = await listRules(ctx.organizationId);
  const routingRules: RoutingRule[] = routingRulesRaw.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    action: r.action,
    tagName: r.tagName,
    enabled: r.enabled,
    note: r.note,
    matchCount: r.matchCount,
    lastMatchedAt: r.lastMatchedAt,
    createdAt: r.createdAt,
  }));

  const connections = await prisma.gmailConnection.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      emailAddress: true,
      status: true,
      lastSyncedAt: true,
      lastError: true,
      lastErrorAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Configurações</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            Gmail
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Canal Gmail
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Conecte caixas Gmail pra receber emails como tickets automaticamente e
          responder direto pelo SmartDesk — sem sair pro inbox.
        </p>
      </header>

      {connected ? (
        <div className="rounded-sm border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          ✓ Conta <code className="font-mono">{decodeURIComponent(connected)}</code> conectada com sucesso.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-sm border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
          ⚠ {decodeURIComponent(error)}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          {/* 01 — Conectar */}
          <section className="card flex flex-col gap-4 p-5">
            <header>
              <p className="divider-eyebrow text-muted-foreground">
                <span className="numeral-serif text-[0.6875rem] text-primary">01</span>
                <span className="mx-1.5 opacity-40">·</span>
                Conectar nova conta
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Vamos pedir acesso de leitura, envio e gerenciamento da caixa selecionada.
              </p>
            </header>

            {!isOAuthConfigured ? (
              <div className="rounded-sm border border-warning/30 bg-warning-soft/60 p-3 text-xs">
                <p className="mb-1 font-medium text-warning">⚠ Google OAuth não configurado.</p>
                <p className="text-muted-foreground-strong">
                  Defina <code className="rounded-sm bg-muted px-1 font-mono">GOOGLE_CLIENT_ID</code>,{' '}
                  <code className="rounded-sm bg-muted px-1 font-mono">GOOGLE_CLIENT_SECRET</code> e{' '}
                  <code className="rounded-sm bg-muted px-1 font-mono">GMAIL_REDIRECT_URI</code> em{' '}
                  <code className="rounded-sm bg-muted px-1 font-mono">.env.local</code>. Crie credenciais OAuth no{' '}
                  <a
                    className="text-primary hover:underline"
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Cloud Console
                  </a>.
                </p>
              </div>
            ) : (
              <Link
                href="/api/integrations/gmail/connect/start"
                className="inline-flex w-fit items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="2" y="3" width="12" height="10" />
                  <path d="M2 4l6 5 6-5" />
                </svg>
                Conectar Gmail
                <span aria-hidden className="font-mono text-xs">→</span>
              </Link>
            )}
          </section>

          {/* 02 — Conectadas */}
          <section className="card flex flex-col gap-4 p-5">
            <header className="flex items-baseline justify-between gap-3">
              <div>
                <p className="divider-eyebrow text-muted-foreground">
                  <span className="numeral-serif text-[0.6875rem] text-primary">02</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  Contas conectadas
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Cada caixa fica sincronizando em background — emails novos viram tickets.
                </p>
              </div>
              <span className="numeral-serif text-2xl text-primary">{connections.length}</span>
            </header>

            {connections.length === 0 ? (
              <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Nenhuma conta conectada ainda.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-sm border border-border">
                {connections.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 bg-surface-raised p-3 transition-colors hover:bg-muted/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <rect x="2" y="3" width="12" height="10" />
                          <path d="M2 4l6 5 6-5" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm text-foreground">{c.emailAddress}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-muted-foreground">
                          {c.status === 'active' ? (
                            <span className="pill bg-success-soft text-success">● Ativo</span>
                          ) : c.status === 'reauth_required' ? (
                            <span className="pill bg-warning-soft text-warning">⚠ Reautenticar</span>
                          ) : (
                            <span className="pill bg-muted text-muted-foreground">○ Desativado</span>
                          )}
                          {c.lastSyncedAt ? <span>sync {formatDateTime(c.lastSyncedAt)}</span> : null}
                          {c.lastError ? (
                            <span className="text-destructive">· erro: {c.lastError.slice(0, 60)}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <form action={disconnectGmailAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        className="rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
                      >
                        Desconectar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <RoutingSection rules={routingRules} />
        </div>

        <aside className="flex flex-col gap-4" data-anim="reveal" data-delay="2">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Como funciona</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Ingest em tempo real
            </h3>
            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
              <li>
                <span className="numeral-serif mr-1 text-primary">1.</span>
                Email novo chega na caixa conectada
              </li>
              <li>
                <span className="numeral-serif mr-1 text-primary">2.</span>
                SmartDesk cria/atualiza ticket vinculado ao solicitante
              </li>
              <li>
                <span className="numeral-serif mr-1 text-primary">3.</span>
                Regras de automação rodam, integrações enriquecem o ticket
              </li>
              <li>
                <span className="numeral-serif mr-1 text-primary">4.</span>
                Resposta enviada do SmartDesk vai como reply no thread original
              </li>
            </ol>
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Permissões pedidas</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li>
                <span className="font-mono text-foreground">gmail.readonly</span> · ler emails
              </li>
              <li>
                <span className="font-mono text-foreground">gmail.send</span> · enviar respostas
              </li>
              <li>
                <span className="font-mono text-foreground">gmail.modify</span> · marcar como lido/arquivado
              </li>
            </ul>
            <p className="mt-3 text-[0.6875rem] text-muted-foreground">
              Você pode revogar o acesso a qualquer momento em{' '}
              <a
                className="text-primary hover:underline"
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
              >
                myaccount.google.com/permissions
              </a>.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
