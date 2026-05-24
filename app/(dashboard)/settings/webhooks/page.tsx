import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listEndpoints, WEBHOOK_EVENTS } from '@/src/services/webhooks';
import { formatDateTime } from '@/src/lib/format';
import { NewWebhookForm } from './new-form';
import { toggleWebhookAction, deleteWebhookAction } from './actions';

export const metadata = { title: 'Webhooks — SmartDesk' };

export default async function WebhooksPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');

  const endpoints = await listEndpoints(ctx.organizationId);

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Configurações</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            Webhooks
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Webhooks outbound
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          SmartDesk envia POST com payload JSON pra URLs externas quando eventos
          acontecem (ticket criado, status mudou, CSAT recebido, etc.). Cada
          requisição é assinada com HMAC-SHA256 pra você validar autenticidade.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          <NewWebhookForm events={WEBHOOK_EVENTS} />

          <section className="card flex flex-col gap-4 p-5">
            <header className="flex items-baseline justify-between gap-3">
              <div>
                <p className="divider-eyebrow text-muted-foreground">
                  <span className="numeral-serif text-[0.6875rem] text-primary">02</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  Endpoints registrados
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Cada endpoint recebe um POST por evento. Retries automáticos com backoff (5 tentativas).
                </p>
              </div>
              <span className="numeral-serif text-2xl text-primary">{endpoints.length}</span>
            </header>

            {endpoints.length === 0 ? (
              <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Nenhum webhook ainda.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {endpoints.map((e) => (
                  <li
                    key={e.id}
                    className={`rounded-sm border p-3 ${
                      e.enabled ? 'border-border bg-surface-raised' : 'border-border bg-muted/30 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <p className="font-medium text-foreground">{e.name}</p>
                          {e.enabled ? (
                            <span className="pill bg-success-soft text-success">● ativo</span>
                          ) : (
                            <span className="pill bg-muted text-muted-foreground">⏸ pausado</span>
                          )}
                        </div>
                        <p className="mt-1 truncate font-mono text-[0.6875rem] text-muted-foreground">
                          {e.url}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(e.events as string[]).map((ev) => (
                            <code
                              key={ev}
                              className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground"
                            >
                              {ev}
                            </code>
                          ))}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
                          <span>
                            <span className="numeral-serif text-foreground">{e.deliveryCount}</span> entregas
                          </span>
                          {e.failureCount > 0 ? (
                            <span className="text-destructive">
                              <span className="numeral-serif">{e.failureCount}</span> falhas
                            </span>
                          ) : null}
                          {e.lastDeliveryAt ? (
                            <span>última {formatDateTime(e.lastDeliveryAt)}</span>
                          ) : (
                            <span>nunca disparou</span>
                          )}
                        </div>
                        {e.lastError ? (
                          <p className="mt-2 rounded-sm border border-destructive/30 bg-destructive-soft px-2 py-1 text-[0.6875rem] text-destructive">
                            ⚠ {e.lastError.slice(0, 200)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <form action={toggleWebhookAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="enabled" value={e.enabled ? 'false' : 'true'} />
                          <button
                            type="submit"
                            className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {e.enabled ? '⏸ Pausar' : '▶ Ativar'}
                          </button>
                        </form>
                        <form action={deleteWebhookAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button
                            type="submit"
                            className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
                          >
                            ✕
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Como funciona</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Validar assinatura
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Cada requisição inclui header{' '}
              <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">
                X-SmartDesk-Signature: sha256=&lt;hex&gt;
              </code>
              . Validar:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-sm bg-muted p-2 text-[0.6875rem]">
{`const expected = crypto
  .createHmac('sha256', SECRET)
  .update(\`\${timestamp}.\${body}\`)
  .digest('hex');
// timingSafeEqual(expected, sig)`}
            </pre>
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Headers enviados</p>
            <ul className="mt-2 space-y-1 text-[0.6875rem] text-muted-foreground">
              <li><code className="font-mono text-foreground">X-SmartDesk-Event</code></li>
              <li><code className="font-mono text-foreground">X-SmartDesk-Timestamp</code></li>
              <li><code className="font-mono text-foreground">X-SmartDesk-Signature</code></li>
            </ul>
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Retry policy</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Tentativas: 5. Backoff exponencial. Status 2xx = sucesso; qualquer
              outra coisa (timeout 15s, erro de rede, 4xx, 5xx) = falha e retry.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
