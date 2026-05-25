import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { listTemplates } from '@/src/services/whatsapp/templates';
import { formatDateTime } from '@/src/lib/format';
import { NewTemplateForm } from './new-template-form';
import { syncTemplateAction, deleteTemplateAction } from './actions';

export const metadata = { title: 'Templates WhatsApp — SmartDesk' };

export default async function WhatsappTemplatesPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');

  const [templates, connections] = await Promise.all([
    listTemplates(ctx.organizationId),
    prisma.whatsappConnection.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null, status: 'active' },
      select: { id: true, displayPhoneNumber: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/settings/whatsapp"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            WhatsApp
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            Templates
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Templates de mensagem
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Templates são mensagens estruturadas aprovadas pela Meta — únicas que podem ser enviadas
          fora da janela de 24h de conversa. Você cria aqui, manda pra aprovação automática, e
          depois envia preenchendo as variáveis.
        </p>
      </header>

      {connections.length === 0 ? (
        <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Conecte primeiro um número WhatsApp em{' '}
          <Link href="/settings/whatsapp" className="text-primary hover:underline">
            Configurações → WhatsApp
          </Link>
          .
        </p>
      ) : (
        <>
          <NewTemplateForm connections={connections} />

          <section className="card flex flex-col gap-4 p-5">
            <header className="flex items-baseline justify-between gap-3">
              <div>
                <p className="divider-eyebrow text-muted-foreground">
                  <span className="numeral-serif text-[0.6875rem] text-primary">02</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  Templates ({templates.length})
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Status sincronizado com o Meta. Use o botão de refresh pra forçar atualização.
                </p>
              </div>
            </header>

            {templates.length === 0 ? (
              <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Nenhum template criado ainda.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-sm border border-border bg-surface-raised p-3 transition-colors hover:border-border-strong"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="font-mono text-sm font-medium text-foreground">
                            {t.name}
                          </p>
                          <span className="text-[0.6875rem] text-muted-foreground">
                            · {t.language}
                          </span>
                          <span className="text-[0.6875rem] text-muted-foreground">
                            · {t.category}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.6875rem]">
                          <StatusBadge status={t.status} />
                          <span className="text-muted-foreground">
                            de {t.connection.displayPhoneNumber}
                          </span>
                          <span className="text-muted-foreground">
                            · enviado {t._count.sends}x
                          </span>
                          {t.approvedAt ? (
                            <span className="text-muted-foreground">
                              · aprovado em {formatDateTime(t.approvedAt)}
                            </span>
                          ) : null}
                          {t.submittedAt && !t.approvedAt ? (
                            <span className="text-muted-foreground">
                              · submetido {formatDateTime(t.submittedAt)}
                            </span>
                          ) : null}
                        </div>
                        {t.rejectionReason ? (
                          <p className="mt-2 rounded-sm border border-destructive/30 bg-destructive-soft px-2 py-1 text-[0.6875rem] text-destructive">
                            ⚠ Meta rejeitou: {t.rejectionReason.slice(0, 200)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {t.metaTemplateId ? (
                          <form action={syncTemplateAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <button
                              type="submit"
                              title="Atualizar status no Meta"
                              className="rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                            >
                              ↻ Sync
                            </button>
                          </form>
                        ) : null}
                        <form action={deleteTemplateAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            type="submit"
                            className="rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
                          >
                            Excluir
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    draft:    { bg: 'bg-muted',           text: 'text-muted-foreground', label: 'rascunho' },
    pending:  { bg: 'bg-warning-soft',    text: 'text-warning',          label: 'em análise' },
    approved: { bg: 'bg-success-soft',    text: 'text-success',          label: 'aprovado' },
    rejected: { bg: 'bg-destructive-soft', text: 'text-destructive',     label: 'rejeitado' },
    paused:   { bg: 'bg-warning-soft',    text: 'text-warning',          label: 'pausado' },
    disabled: { bg: 'bg-muted',           text: 'text-muted-foreground', label: 'desativado' },
  };
  const s = map[status] ?? map.pending!;
  return <span className={`pill ${s.bg} ${s.text}`}>{s.label}</span>;
}
