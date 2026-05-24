'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import {
  createSavedFilterAction,
  deleteSavedFilterAction,
  type SavedFilterState,
} from './actions';

export type SavedFilterItem = {
  id: string;
  name: string;
  params: Record<string, string | string[]>;
  shared: boolean;
};

export function SavedFiltersBar({
  filters,
  canShare,
  currentParams,
}: {
  filters: SavedFilterItem[];
  canShare: boolean;
  currentParams: Record<string, string | string[]>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const [showSave, setShowSave] = useState(false);

  const currentHasFilter = hasActiveFilter(currentParams);
  const activeId = matchActiveFilter(filters, currentParams);

  function applyFilter(item: SavedFilterItem) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(item.params)) {
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
      else if (typeof v === 'string' && v) params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  // Fecha modal automaticamente após salvar com sucesso (state.ok)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
        Filtros:
      </span>

      <Link
        href="/tickets"
        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
          !sp.toString()
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-surface-raised text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        Todos
      </Link>

      {filters.map((f) => (
        <FilterChip
          key={f.id}
          item={f}
          active={activeId === f.id}
          onApply={() => applyFilter(f)}
        />
      ))}

      {currentHasFilter && activeId === null ? (
        <button
          type="button"
          onClick={() => setShowSave(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary/60 px-3 py-1 text-xs font-medium text-primary hover:border-primary hover:bg-primary-soft"
        >
          <span aria-hidden>＋</span> Salvar filtro atual
        </button>
      ) : null}

      {showSave ? (
        <SaveDialog
          onClose={() => setShowSave(false)}
          currentParams={currentParams}
          canShare={canShare}
        />
      ) : null}
    </div>
  );
}

function FilterChip({
  item,
  active,
  onApply,
}: {
  item: SavedFilterItem;
  active: boolean;
  onApply: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <span
      className={`group inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-surface-raised text-foreground-secondary hover:bg-muted'
      }`}
    >
      <button type="button" onClick={onApply} className="font-medium">
        {item.shared ? <span aria-hidden className="mr-1 opacity-70">◇</span> : null}
        {item.name}
      </button>
      {confirming ? (
        <form action={deleteSavedFilterAction}>
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            className={`rounded-sm border px-1 text-[0.6875rem] ${
              active
                ? 'border-primary-foreground/40 text-primary-foreground'
                : 'border-destructive/40 text-destructive'
            } hover:border-destructive hover:bg-destructive-soft hover:text-destructive`}
            onMouseLeave={() => setConfirming(false)}
            title="Confirmar exclusão"
          >
            confirmar?
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`opacity-0 transition-opacity group-hover:opacity-60 hover:opacity-100 ${
            active ? 'text-primary-foreground/80' : 'text-muted-foreground'
          }`}
          aria-label={`Excluir filtro ${item.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

function SaveDialog({
  onClose,
  currentParams,
  canShare,
}: {
  onClose: () => void;
  currentParams: Record<string, string | string[]>;
  canShare: boolean;
}) {
  const [state, formAction, pending] = useActionState<SavedFilterState, FormData>(
    createSavedFilterAction,
    undefined,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state && 'ok' in state && state.ok) onClose();
  }, [state, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-md border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-medium tracking-tight">
          Salvar filtro atual
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Atalho de 1 clique para retornar a essa combinação de filtros.
        </p>

        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="paramsJson" value={JSON.stringify(currentParams)} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-secondary">Nome</span>
            <input
              ref={inputRef}
              name="name"
              required
              maxLength={120}
              placeholder="ex: Urgentes não atribuídos"
              className="rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
          </label>

          {canShare ? (
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" name="shared" className="mt-0.5" />
              <span>
                <span className="font-medium text-foreground">Compartilhar com o time</span>
                <span className="ml-1 text-muted-foreground">— visível pra todos da organização</span>
              </span>
            </label>
          ) : null}

          {state && !state.ok ? (
            <p className="rounded-sm border border-destructive/30 bg-destructive-soft px-2 py-1 text-xs text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-xs hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-md disabled:opacity-60"
            >
              {pending ? 'Salvando…' : 'Salvar filtro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function hasActiveFilter(params: Record<string, string | string[]>): boolean {
  return Object.keys(params).some((k) => k !== 'page');
}

function matchActiveFilter(
  filters: SavedFilterItem[],
  current: Record<string, string | string[]>,
): string | null {
  const norm = normalizeParams(current);
  for (const f of filters) {
    if (deepEqual(normalizeParams(f.params), norm)) return f.id;
  }
  return null;
}

function normalizeParams(p: Record<string, string | string[]>): string {
  const entries = Object.entries(p)
    .filter(([k]) => k !== 'page')
    .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function deepEqual(a: string, b: string): boolean {
  return a === b;
}
