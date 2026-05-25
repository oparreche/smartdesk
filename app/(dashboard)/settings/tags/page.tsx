import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { isAiConfigured } from '@/src/lib/gemini';
import { listTags } from '@/src/services/tags';
import { getCategorizationConfig } from '@/src/services/categorization/config';
import { asKeywordArray } from '@/src/services/categorization/keywords';
import { NewTagForm } from './new-tag-form';
import { CategorizationSettings } from './categorization-settings';
import { TagCategorizationForm } from './tag-categorization-form';
import { deleteTagAction } from './actions';

export const metadata = { title: 'Tags — SmartDesk' };

export default async function TagsPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tags:manage');

  const [tags, categorization] = await Promise.all([
    listTags(ctx.organizationId),
    getCategorizationConfig(ctx.organizationId),
  ]);

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="border-b border-border pb-6">
        <p className="divider-eyebrow text-muted-foreground">Configurações</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Tags</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Categorize tickets para facilitar busca, automações e relatórios.
        </p>
      </header>

      <CategorizationSettings
        enabled={categorization.enabled}
        mode={categorization.mode}
        hasTenantKey={categorization.hasTenantKey}
        aiConfiguredGlobally={isAiConfigured()}
      />

      <NewTagForm />

      <section className="flex flex-col gap-3">
        {tags.length === 0 ? (
          <p className="card px-4 py-12 text-center text-sm text-muted-foreground">Nenhuma tag ainda.</p>
        ) : (
          tags.map((t) => {
            const keywords = asKeywordArray(t.keywords);
            return (
              <div key={t.id} className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={t.color ? { backgroundColor: `${t.color}22`, color: t.color } : { backgroundColor: 'var(--muted)', color: 'var(--foreground)' }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color ?? 'var(--muted-foreground)' }} />
                      {t.name}
                    </span>
                    {t.autoCategorize ? (
                      <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-primary">
                        auto · {keywords.length} kw
                      </span>
                    ) : null}
                    <span className="numeral-serif text-xs text-muted-foreground">{t._count.tickets} tickets</span>
                  </div>
                  <form action={deleteTagAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      className="rounded-sm border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      Excluir
                    </button>
                  </form>
                </div>

                <details>
                  <summary className="cursor-pointer list-none border-t border-border-subtle px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                    ⚙ Categorização automática {t.autoCategorize ? '(ativa)' : '(inativa)'}
                  </summary>
                  <TagCategorizationForm
                    id={t.id}
                    description={t.description}
                    keywords={keywords}
                    minKeywordMatches={t.minKeywordMatches}
                    autoCategorize={t.autoCategorize}
                  />
                </details>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
