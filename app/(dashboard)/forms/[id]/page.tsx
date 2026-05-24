import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { getForm } from '@/src/services/forms';
import { listQueues } from '@/src/services/queues';
import { env } from '@/src/lib/env';
import { AddFieldForm } from './add-field-form';
import { FieldIcon } from './field-icons';
import { CopyButton } from './copy-button';
import {
  updateFormAction,
  deleteFieldAction,
  moveFieldAction,
  deleteFormAction,
} from '../actions';

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return { title: `Formulário ${id.slice(0, 6)} — SmartDesk` };
}

const TYPE_LABEL: Record<string, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  email: 'Email',
  phone: 'Telefone',
  document: 'CPF/CNPJ',
  number: 'Número',
  currency: 'Moeda',
  date: 'Data',
  select: 'Lista',
  multiselect: 'Lista (múltipla)',
  checkbox: 'Checkbox',
  url: 'URL',
  hidden: 'Oculto',
};

const MAPS_LABEL: Record<string, string> = {
  'ticket.subject': 'Assunto',
  'ticket.description': 'Descrição',
  'requester.name': 'Nome',
  'requester.email': 'Email',
  'requester.phone': 'Telefone',
  'requester.document': 'Documento',
};

export default async function FormEditPage(props: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'forms:write');
  const { id } = await props.params;

  const [form, queues] = await Promise.all([
    getForm(ctx.organizationId, id),
    listQueues(ctx.organizationId),
  ]);

  if (!form) notFound();

  const publicUrl = `${env.APP_URL}/f/${form.slug}`;
  const lastSubmissionLabel = form.fields.length === 0 ? 'sem campos' : `${form.fields.length} campo${form.fields.length === 1 ? '' : 's'}`;

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      {/* HEADER */}
      <header className="flex flex-col gap-4 border-b border-border pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link href="/forms" className="hover:text-foreground hover:underline">Formulários</Link>
              <span>/</span>
              <span className="font-mono">{form.id.slice(0, 8)}</span>
            </div>
            <h1 className="mt-3 truncate font-display text-3xl font-semibold tracking-tight">{form.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {form.description ?? <em>sem descrição</em>} · <span>{lastSubmissionLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {form.isPublished ? (
              <span className="pill" style={{ backgroundColor: '#e3f1ea', color: '#1d6d56' }}>Publicado</span>
            ) : (
              <span className="pill" style={{ backgroundColor: '#ebe8df', color: '#4a4c54' }}>Rascunho</span>
            )}
            {form.isPublished ? (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted"
              >
                Abrir pública <span aria-hidden className="font-mono text-xs">↗</span>
              </a>
            ) : null}
          </div>
        </div>

        {/* URL pública em barra destacada */}
        <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-sunken px-3 py-2">
          <span className="divider-eyebrow shrink-0 text-muted-foreground">URL pública</span>
          <code className="flex-1 truncate font-mono text-xs text-foreground">{publicUrl}</code>
          <CopyButton value={publicUrl} />
        </div>
      </header>

      {/* LAYOUT 2 COLUNAS */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* EDITOR */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* CONFIGURAÇÕES */}
          <form action={updateFormAction} className="card flex flex-col gap-4 p-5">
            <input type="hidden" name="id" value={form.id} />

            <header className="flex items-center justify-between">
              <h2 className="divider-eyebrow">Configurações</h2>
              <button
                type="submit"
                className="rounded-sm bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-md"
              >
                Salvar
              </button>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Nome">
                <input
                  name="name"
                  defaultValue={form.name}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Descrição">
                <input
                  name="description"
                  defaultValue={form.description ?? ''}
                  className={inputClass}
                />
              </Field>
              <Field label="Fila padrão">
                <select
                  name="defaultQueueId"
                  defaultValue={form.defaultQueueId ?? ''}
                  className={selectClass}
                >
                  <option value="">— padrão da org —</option>
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Prioridade padrão">
                <select
                  name="defaultPriority"
                  defaultValue={form.defaultPriority}
                  className={selectClass}
                >
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                  <option value="critical">Crítica</option>
                </select>
              </Field>
              <Field label="Mensagem de sucesso" className="md:col-span-2">
                <input
                  name="successMessage"
                  defaultValue={form.successMessage ?? ''}
                  placeholder="Mensagem exibida ao usuário depois de enviar"
                  className={inputClass}
                />
              </Field>
            </div>

            {/* Toggle Publicar */}
            <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-border bg-surface-sunken/60 p-3">
              <input
                type="checkbox"
                name="isPublished"
                defaultChecked={form.isPublished}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium">Publicar formulário</span>
                <span className="text-xs text-muted-foreground">
                  Quando ativo, a URL pública aceita submissões. Desligue pra esconder sem perder os dados.
                </span>
              </span>
            </label>
          </form>

          {/* CAMPOS */}
          <section className="flex flex-col gap-3">
            <header className="flex items-center justify-between">
              <h2 className="divider-eyebrow">
                Campos ({form.fields.length})
              </h2>
              <span className="text-[0.6875rem] text-muted-foreground">
                Reordene com as setas
              </span>
            </header>

            {form.fields.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-surface-sunken/40 p-8 text-center text-sm text-muted-foreground">
                Nenhum campo ainda. Adicione campos abaixo para começar.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {form.fields.map((f, i) => {
                  const isMapped = Boolean(f.mapsTo);
                  return (
                    <li
                      key={f.id}
                      className="group flex items-center gap-3 rounded-md border border-border bg-surface p-3 shadow-xs transition-all hover:border-border-strong hover:shadow-sm"
                    >
                      <span className="numeral-serif w-6 shrink-0 text-center text-xs text-muted-foreground">
                        {String(i + 1).padStart(2, '0')}
                      </span>

                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary">
                        <FieldIcon type={f.type} className="h-4 w-4" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">
                          {f.label}
                          {f.required ? (
                            <span title="Obrigatório" className="text-destructive">*</span>
                          ) : null}
                          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                            {TYPE_LABEL[f.type] ?? f.type}
                          </span>
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-mono">{f.key}</span>
                          {isMapped ? (
                            <>
                              <span aria-hidden>→</span>
                              <span className="text-foreground">
                                {MAPS_LABEL[f.mapsTo!] ?? <code>{f.mapsTo}</code>}
                              </span>
                            </>
                          ) : (
                            <span>(custom field)</span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                        <form action={moveFieldAction}>
                          <input type="hidden" name="formId" value={form.id} />
                          <input type="hidden" name="fieldId" value={f.id} />
                          <input type="hidden" name="direction" value="up" />
                          <button
                            type="submit"
                            disabled={i === 0}
                            title="Mover acima"
                            className="flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-surface-raised text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="2 6 5 3 8 6" />
                            </svg>
                          </button>
                        </form>
                        <form action={moveFieldAction}>
                          <input type="hidden" name="formId" value={form.id} />
                          <input type="hidden" name="fieldId" value={f.id} />
                          <input type="hidden" name="direction" value="down" />
                          <button
                            type="submit"
                            disabled={i === form.fields.length - 1}
                            title="Mover abaixo"
                            className="flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-surface-raised text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="2 4 5 7 8 4" />
                            </svg>
                          </button>
                        </form>
                        <form action={deleteFieldAction}>
                          <input type="hidden" name="formId" value={form.id} />
                          <input type="hidden" name="fieldId" value={f.id} />
                          <button
                            type="submit"
                            title="Excluir"
                            className="flex h-7 w-7 items-center justify-center rounded-sm border border-destructive/30 text-destructive hover:bg-destructive/10"
                          >
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="2 3 10 3" />
                              <path d="M3.5 3v7a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V3" />
                              <path d="M5 3V2a.5.5 0 0 1 .5-.5h1A.5.5 0 0 1 7 2v1" />
                            </svg>
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <AddFieldForm formId={form.id} />
          </section>

          {/* ZONA DE PERIGO */}
          <section className="rounded-md border border-destructive/30 bg-destructive-soft/30 p-4">
            <form action={deleteFormAction} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-destructive">Zona de perigo</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Excluir o formulário (soft-delete). Tickets já criados ficam intactos.
                </p>
              </div>
              <input type="hidden" name="id" value={form.id} />
              <button
                type="submit"
                className="rounded-sm border border-destructive/30 bg-surface-raised px-3 py-1.5 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                Excluir
              </button>
            </form>
          </section>
        </div>

        {/* PREVIEW */}
        <aside className="hidden xl:block">
          <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col gap-2">
            <header className="flex items-center justify-between">
              <h2 className="divider-eyebrow">Preview ao vivo</h2>
              {form.isPublished ? (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[0.6875rem] uppercase tracking-widest text-primary hover:underline"
                >
                  abrir em nova aba ↗
                </a>
              ) : null}
            </header>
            {form.isPublished ? (
              <div className="overflow-hidden rounded-md border border-border bg-surface-raised shadow-sm">
                <div className="flex items-center gap-1.5 border-b border-border bg-surface-sunken px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                  <span className="ml-3 font-mono text-[0.625rem] text-muted-foreground">{publicUrl}</span>
                </div>
                <iframe
                  src={publicUrl}
                  title="Preview do formulário público"
                  className="block h-[600px] w-full bg-white"
                  sandbox="allow-same-origin allow-forms"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border bg-surface-sunken/40 p-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 10c2-4 5-6 8-6s6 2 8 6c-2 4-5 6-8 6s-6-2-8-6z" />
                    <path d="M2 2l16 16" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-medium">Preview fica disponível depois de publicar</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Marque a opção "Publicar formulário" acima e salve para ativar.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Helpers de UI ─────────────────────────────────────────────

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

const selectClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none focus:border-primary';

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className ?? ''}`}>
      <span className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
