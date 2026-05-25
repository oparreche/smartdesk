import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { can, requirePermission } from '@/src/lib/permissions';
import { listRules } from '@/src/services/rules/crud';
import {
  TRIGGER_LABEL,
  describeCondition,
  describeActionsJson,
  conditionFromJson,
} from '@/src/services/rules/describe';
import { formatRelativeShort } from '@/src/lib/format';
import { RuleDeleteButton } from './rule-delete-button';
import { toggleRuleAction } from './actions';

export const metadata = { title: 'Regras — SmartDesk' };

export default async function RulesListPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:read');
  const canWrite = can(ctx.role, 'rules:write');

  const rules = await listRules(ctx.organizationId);
  const now = new Date();
  const active = rules.filter((r) => r.enabled).length;

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="flex items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Automação</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Regras</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Reaja a eventos do ticket aplicando prioridade, fila, atribuição, tags e mais.{' '}
            <Link href="/settings/gmail" className="text-primary hover:underline">
              Filtros de email (ignorar/taggear remetente)
            </Link>{' '}
            ficam nas configurações do Gmail.
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/rules/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px"
          >
            Nova regra <span aria-hidden className="font-mono text-xs">＋</span>
          </Link>
        ) : null}
      </header>

      {rules.length === 0 ? (
        <EmptyState canWrite={canWrite} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="numeral-serif text-foreground">{rules.length}</span> regra
            {rules.length === 1 ? '' : 's'} ·{' '}
            <span className="numeral-serif text-foreground">{active}</span> ativa{active === 1 ? '' : 's'} ·
            executadas por ordem crescente
          </p>

          <ul className="flex flex-col gap-3">
            {rules.map((r) => {
              const chips = describeActionsJson(r.actions);
              const cond = describeCondition(conditionFromJson(r.conditions));
              const hasCond = cond !== 'Sempre';
              return (
                <li
                  key={r.id}
                  className={`card flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-start sm:justify-between ${
                    r.enabled ? '' : 'opacity-70'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {/* Linha do título */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="numeral-serif flex h-5 min-w-5 items-center justify-center rounded-sm bg-muted px-1 text-[0.6875rem] text-muted-foreground"
                        title="Ordem de execução"
                      >
                        {r.runOrder}
                      </span>
                      {canWrite ? (
                        <Link href={`/rules/${r.id}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{r.name}</span>
                      )}
                      <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                        {TRIGGER_LABEL[r.trigger] ?? r.trigger}
                      </span>
                      {!r.enabled ? (
                        <span className="pill bg-muted text-muted-foreground">○ pausada</span>
                      ) : null}
                      {r.stopAfterMatch ? (
                        <span className="pill bg-warning-soft text-warning" title="Não avalia regras seguintes após aplicar">
                          ⊟ para após match
                        </span>
                      ) : null}
                    </div>

                    {/* Condição → ações */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">
                        {hasCond ? (
                          <>
                            <span className="font-mono text-[0.625rem] uppercase tracking-wider">se</span>{' '}
                            <span className="font-mono text-foreground-secondary">{cond}</span>
                          </>
                        ) : (
                          <span className="italic">sem condição (sempre)</span>
                        )}
                      </span>
                      <span aria-hidden className="text-muted-foreground">→</span>
                      {chips.length === 0 ? (
                        <span className="italic text-muted-foreground">nenhuma ação</span>
                      ) : (
                        chips.map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-raised px-1.5 py-0.5 text-[0.6875rem] text-foreground-secondary"
                          >
                            <span aria-hidden className="font-mono text-primary">{c.icon}</span>
                            {c.label}
                          </span>
                        ))
                      )}
                    </div>

                    <p className="mt-2 text-[0.6875rem] text-muted-foreground">
                      atualizada {formatRelativeShort(r.updatedAt, now)}
                    </p>
                  </div>

                  {/* Ações da linha */}
                  {canWrite ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <form action={toggleRuleAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="enabled" value={r.enabled ? 'false' : 'true'} />
                        <button
                          type="submit"
                          className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground"
                          title={r.enabled ? 'Pausar regra' : 'Ativar regra'}
                        >
                          {r.enabled ? '⏸ pausar' : '▶ ativar'}
                        </button>
                      </form>
                      <Link
                        href={`/rules/${r.id}`}
                        className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        editar
                      </Link>
                      <RuleDeleteButton id={r.id} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function EmptyState({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-xl text-primary">
        ⚙
      </span>
      <h2 className="font-display text-lg font-medium tracking-tight">Nenhuma regra ainda</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Crie regras para rotear, priorizar e taggear tickets automaticamente — ou crie direto de um
        ticket pelo botão <span className="font-mono">⤳</span> na lista.
      </p>
      {canWrite ? (
        <Link
          href="/rules/new"
          className="mt-1 inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
        >
          Criar primeira regra <span aria-hidden className="font-mono text-xs">＋</span>
        </Link>
      ) : null}
    </div>
  );
}
