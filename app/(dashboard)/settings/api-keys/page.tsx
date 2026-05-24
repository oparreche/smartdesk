import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listKeys, ALL_SCOPES } from '@/src/services/api-keys';
import { formatDateTime } from '@/src/lib/format';
import { NewKeyForm } from './new-form';
import { revokeKeyAction } from './actions';

export const metadata = { title: 'API keys — SmartDesk' };

export default async function ApiKeysPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');

  const keys = await listKeys(ctx.organizationId);

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Configurações</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            API keys
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          API pública
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Acesse e crie tickets via REST.{' '}
          <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">
            Authorization: Bearer sk_…
          </code>
          {' · '}Rate limit: 120 req/min por key. Veja a documentação no aside →
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          <NewKeyForm scopes={ALL_SCOPES} />

          <section className="card flex flex-col gap-4 p-5">
            <header className="flex items-baseline justify-between gap-3">
              <div>
                <p className="divider-eyebrow text-muted-foreground">
                  <span className="numeral-serif text-[0.6875rem] text-primary">02</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  Keys ativas
                </p>
              </div>
              <span className="numeral-serif text-2xl text-primary">{keys.length}</span>
            </header>

            {keys.length === 0 ? (
              <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Nenhuma key criada.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {keys.map((k) => (
                  <li
                    key={k.id}
                    className="rounded-sm border border-border bg-surface-raised p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <p className="font-medium text-foreground">{k.name}</p>
                          <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem]">
                            sk_{k.prefix}
                          </code>
                          {k.expiresAt && k.expiresAt < new Date() ? (
                            <span className="pill bg-destructive-soft text-destructive">expirada</span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(k.scopes as string[]).map((s) => (
                            <code
                              key={s}
                              className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground"
                            >
                              {s}
                            </code>
                          ))}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
                          {k.lastUsedAt ? (
                            <span>último uso {formatDateTime(k.lastUsedAt)}</span>
                          ) : (
                            <span>nunca usada</span>
                          )}
                          <span>criada {formatDateTime(k.createdAt)}</span>
                          {k.expiresAt ? (
                            <span>expira {formatDateTime(k.expiresAt)}</span>
                          ) : null}
                        </div>
                      </div>
                      <form action={revokeKeyAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <button
                          type="submit"
                          className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
                          title="Revogar"
                        >
                          Revogar
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Endpoints</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              REST v1
            </h3>
            <dl className="mt-3 space-y-2 text-[0.6875rem]">
              <div>
                <dt><code className="font-mono text-foreground">GET /api/v1/tickets</code></dt>
                <dd className="text-muted-foreground">Listar tickets (paginação, filtro por status, busca)</dd>
              </div>
              <div>
                <dt><code className="font-mono text-foreground">POST /api/v1/tickets</code></dt>
                <dd className="text-muted-foreground">Criar ticket</dd>
              </div>
              <div>
                <dt><code className="font-mono text-foreground">GET /api/v1/tickets/:code</code></dt>
                <dd className="text-muted-foreground">Detalhe + mensagens</dd>
              </div>
            </dl>
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Exemplo</p>
            <pre className="mt-2 overflow-x-auto rounded-sm bg-muted p-2 text-[0.6875rem]">
{`curl https://app/api/v1/tickets \\
  -H "Authorization: Bearer sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"subject":"Erro 500","requester":{"email":"x@y.com"}}'`}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
