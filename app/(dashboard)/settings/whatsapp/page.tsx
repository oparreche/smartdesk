import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { env } from '@/src/lib/env';
import { listConnections, buildConnectionView } from '@/src/services/whatsapp/setup';
import { formatDateTime } from '@/src/lib/format';
import { NewConnectionForm } from './new-connection-form';
import { disconnectWhatsappAction } from './actions';

export const metadata = { title: 'WhatsApp — SmartDesk' };

export default async function WhatsappSettingsPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');

  const raw = await listConnections(ctx.organizationId);
  const connections = raw.map((c) => buildConnectionView(c, env.APP_URL));

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Configurações</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            WhatsApp
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Canal WhatsApp
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Conecte números WhatsApp Business via Cloud API da Meta pra receber
          mensagens como tickets e responder dentro do SmartDesk.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          <NewConnectionForm />

          <section className="card flex flex-col gap-4 p-5">
            <header className="flex items-baseline justify-between gap-3">
              <div>
                <p className="divider-eyebrow text-muted-foreground">
                  <span className="numeral-serif text-[0.6875rem] text-primary">02</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  Conexões ativas
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Cada número tem seu próprio webhook + token.
                </p>
              </div>
              <span className="numeral-serif text-2xl text-primary">{connections.length}</span>
            </header>

            {connections.length === 0 ? (
              <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Nenhum número conectado ainda.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {connections.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-sm border border-border bg-surface-raised p-3 transition-colors hover:border-border-strong"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-success/15 text-success">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M17.6 6.32A7.85 7.85 0 0 0 12 4c-4.4 0-8 3.6-8 8 0 1.42.38 2.78 1.04 3.99L4 20l4.13-1.08A7.96 7.96 0 0 0 12 20c4.4 0 8-3.6 8-8 0-2.13-.83-4.14-2.4-5.68zm-5.6 12.3c-1.27 0-2.5-.34-3.58-.99l-.26-.15-2.45.64.65-2.39-.17-.27a6.63 6.63 0 0 1-1.02-3.55c0-3.66 2.99-6.64 6.66-6.64 1.78 0 3.45.69 4.71 1.94a6.6 6.6 0 0 1 1.95 4.71c0 3.66-2.99 6.7-6.49 6.7z" />
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm font-medium text-foreground">
                            {c.displayPhoneNumber}
                          </p>
                          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                            Phone ID <span className="font-mono text-foreground-secondary">{c.phoneNumberId}</span>
                            <span className="mx-1.5">·</span>
                            WABA <span className="font-mono text-foreground-secondary">{c.businessAccountId}</span>
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-muted-foreground">
                            {c.status === 'active' ? (
                              <span className="pill bg-success-soft text-success">● Ativo</span>
                            ) : c.status === 'error' ? (
                              <span className="pill bg-destructive-soft text-destructive">⚠ Erro</span>
                            ) : (
                              <span className="pill bg-muted text-muted-foreground">○ Desativado</span>
                            )}
                            <span>token ••• {c.tokenLast4}</span>
                            <span>{c.hasAppSecret ? '· HMAC ativo' : '· HMAC não configurado'}</span>
                            {c.lastReceivedAt ? (
                              <span>· última msg {formatDateTime(c.lastReceivedAt)}</span>
                            ) : null}
                          </div>
                          {c.lastError ? (
                            <p className="mt-2 rounded-sm border border-destructive/30 bg-destructive-soft px-2 py-1 text-[0.6875rem] text-destructive">
                              ⚠ {c.lastError.slice(0, 200)}
                            </p>
                          ) : null}
                          <details className="mt-2">
                            <summary className="cursor-pointer text-[0.6875rem] text-muted-foreground hover:text-foreground">
                              ver webhook
                            </summary>
                            <div className="mt-1.5 flex flex-col gap-1.5 rounded-sm border border-border bg-surface p-2 text-[0.6875rem]">
                              <div>
                                <span className="text-muted-foreground">URL: </span>
                                <code className="break-all font-mono text-foreground">
                                  {c.webhookUrl}
                                </code>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Verify token: </span>
                                <code className="break-all font-mono text-foreground">
                                  {c.webhookVerifyToken}
                                </code>
                              </div>
                            </div>
                          </details>
                        </div>
                      </div>
                      <form action={disconnectWhatsappAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
                        >
                          Desconectar
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4" data-anim="reveal" data-delay="2">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Pré-requisitos</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Antes de conectar
            </h3>
            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
              <li>
                <span className="numeral-serif mr-1 text-primary">1.</span>
                Número verificado no WhatsApp Business via Cloud API
              </li>
              <li>
                <span className="numeral-serif mr-1 text-primary">2.</span>
                App criado em{' '}
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  developers.facebook.com
                </a>{' '}
                com produto WhatsApp
              </li>
              <li>
                <span className="numeral-serif mr-1 text-primary">3.</span>
                Token permanente via System User
              </li>
            </ol>
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Onde achar cada ID</p>
            <dl className="mt-2 space-y-2 text-xs leading-relaxed">
              <div>
                <dt className="font-mono text-foreground">phone_number_id</dt>
                <dd className="text-muted-foreground">
                  WhatsApp Manager → Phone numbers → clique no número → painel direito
                </dd>
              </div>
              <div>
                <dt className="font-mono text-foreground">waba_id</dt>
                <dd className="text-muted-foreground">
                  Business Suite → WhatsApp accounts → ID logo abaixo do nome
                </dd>
              </div>
              <div>
                <dt className="font-mono text-foreground">access_token</dt>
                <dd className="text-muted-foreground">
                  Business settings → System users → seu user → Generate token
                </dd>
              </div>
              <div>
                <dt className="font-mono text-foreground">app_secret</dt>
                <dd className="text-muted-foreground">
                  App dashboard → Settings → Basic → App Secret
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
