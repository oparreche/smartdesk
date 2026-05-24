import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listMacros } from '@/src/services/macros';
import { MacroEditor } from './macro-editor';
import { deleteMacroAction } from './actions';
import { formatDateTime } from '@/src/lib/format';

export const metadata = { title: 'Macros — SmartDesk' };

export default async function MacrosPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const macros = await listMacros(ctx.organizationId);

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Configurações</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">Macros</span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Respostas salvas
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Templates de resposta que aparecem no composer com <span className="font-mono">⚡</span>. Use{' '}
          <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">
            {'{{ticket.requester.name}}'}
          </code>
          {' '}e similares pra personalizar. Macros podem disparar ações (mudar status, aplicar tag) ao serem inseridas.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          <MacroEditor mode="create" />

          <section className="card flex flex-col gap-4 p-5">
            <header className="flex items-baseline justify-between gap-3">
              <div>
                <p className="divider-eyebrow text-muted-foreground">
                  <span className="numeral-serif text-[0.6875rem] text-primary">02</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  Suas macros
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Ordenadas por uso. Aparecem em ordem no picker do composer.
                </p>
              </div>
              <span className="numeral-serif text-2xl text-primary">{macros.length}</span>
            </header>

            {macros.length === 0 ? (
              <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Nenhuma macro ainda. Crie uma acima.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {macros.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-sm border p-3 transition-colors ${
                      m.enabled
                        ? 'border-border bg-surface-raised'
                        : 'border-border bg-muted/30 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <p className="font-medium text-foreground">{m.name}</p>
                          {m.shortcut ? (
                            <code className="rounded-sm bg-primary-soft px-1.5 py-0.5 font-mono text-[0.6875rem] text-primary">
                              {m.shortcut}
                            </code>
                          ) : null}
                          {!m.enabled ? (
                            <span className="pill bg-muted text-muted-foreground">○ desativada</span>
                          ) : null}
                          {m.actions.length > 0 ? (
                            <span className="pill bg-warning-soft text-warning">
                              ⚡ {m.actions.length} ação{m.actions.length === 1 ? '' : 'ões'}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                          {m.body}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
                          <span>
                            <span className="numeral-serif text-foreground">{m.usageCount}</span> usos
                          </span>
                          {m.lastUsedAt ? <span>último {formatDateTime(m.lastUsedAt)}</span> : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Link
                          href={`/settings/macros/${m.id}`}
                          className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          Editar
                        </Link>
                        <form action={deleteMacroAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <button
                            type="submit"
                            className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
                            title="Excluir"
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

        <aside className="flex flex-col gap-4" data-anim="reveal" data-delay="2">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Variáveis disponíveis</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Use no corpo da macro
            </h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div>
                <dt><code className="rounded-sm bg-muted px-1 font-mono">{'{{ticket.code}}'}</code></dt>
                <dd className="text-muted-foreground">HELP-100020</dd>
              </div>
              <div>
                <dt><code className="rounded-sm bg-muted px-1 font-mono">{'{{ticket.subject}}'}</code></dt>
                <dd className="text-muted-foreground">Assunto do ticket</dd>
              </div>
              <div>
                <dt><code className="rounded-sm bg-muted px-1 font-mono">{'{{ticket.requester.name}}'}</code></dt>
                <dd className="text-muted-foreground">Nome do solicitante (vazio se não tiver)</dd>
              </div>
              <div>
                <dt><code className="rounded-sm bg-muted px-1 font-mono">{'{{agent.name}}'}</code></dt>
                <dd className="text-muted-foreground">Seu nome</dd>
              </div>
              <div>
                <dt><code className="rounded-sm bg-muted px-1 font-mono">{'{{org.name}}'}</code></dt>
                <dd className="text-muted-foreground">Nome da organização</dd>
              </div>
            </dl>
          </div>

          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Atalho</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              :greeting → busca rápida
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Defina um atalho como <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">:greeting</code> e
              digite ele no composer pra inserir a macro sem abrir o picker.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
