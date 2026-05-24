'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createArticleAction, updateArticleAction, type ArticleState } from './actions';

type Props =
  | { mode: 'create' }
  | {
      mode: 'edit';
      id: string;
      initial: {
        title: string;
        slug: string;
        excerpt: string | null;
        content: string;
        category: string | null;
        tags: string | null;
        status: 'draft' | 'published' | 'archived';
      };
    };

const initial: ArticleState = undefined;

export function ArticleEditor(props: Props) {
  const isEdit = props.mode === 'edit';
  const [state, formAction, pending] = useActionState(
    isEdit ? updateArticleAction : createArticleAction,
    initial,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {isEdit ? <input type="hidden" name="id" value={props.id} /> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
        <Field label="Título" hint="Aparece no topo do artigo e na busca.">
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={isEdit ? props.initial.title : ''}
            placeholder="Como abrir um ticket?"
            className={inputClass}
          />
        </Field>
        <Field label="Categoria (opcional)" hint="Pra agrupar na listagem pública.">
          <input
            name="category"
            maxLength={80}
            defaultValue={isEdit ? props.initial.category ?? '' : ''}
            placeholder="Geral"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Resumo curto" hint="Aparece como preview na busca e na sugestão automática. Máx 500 caracteres.">
        <textarea
          name="excerpt"
          rows={2}
          maxLength={500}
          defaultValue={isEdit ? props.initial.excerpt ?? '' : ''}
          placeholder="Resumo em 1-2 frases do que o artigo cobre."
          className={inputClass}
        />
      </Field>

      <Field label="Conteúdo" hint="Markdown simples. Cabeçalhos com #, listas com -.">
        <textarea
          name="content"
          required
          rows={16}
          maxLength={80_000}
          defaultValue={isEdit ? props.initial.content : ''}
          placeholder={`## Visão geral\n\nDescrição do problema/processo.\n\n## Passos\n\n1. Faça X\n2. Confirme Y\n3. Pronto.\n\nSe não funcionar, contate o suporte.`}
          className={`${inputClass} font-mono text-[0.8125rem] leading-relaxed`}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Tags" hint="Separadas por espaço — ajuda a busca.">
          <input
            name="tags"
            maxLength={500}
            defaultValue={isEdit ? props.initial.tags ?? '' : ''}
            placeholder="login senha acesso 2fa"
            className={`${inputClass} font-mono text-[0.8125rem]`}
          />
        </Field>
        <Field label="Status">
          <div className="relative">
            <select
              name="status"
              defaultValue={isEdit ? props.initial.status : 'draft'}
              className={`${inputClass} w-full appearance-none pr-8`}
            >
              <option value="draft">Rascunho</option>
              <option value="published">Publicado</option>
              <option value="archived">Arquivado</option>
            </select>
            <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              ▾
            </span>
          </div>
        </Field>
      </div>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive"
        >
          ⚠ {state.error}
        </p>
      ) : null}
      {state && state.ok && !isEdit ? (
        <p className="rounded-sm border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          ✓ Artigo criado
        </p>
      ) : null}

      <footer className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Link
          href="/knowledge"
          className="rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground-secondary hover:bg-muted"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
        >
          {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar artigo'}
        </button>
      </footer>
    </form>
  );
}

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
