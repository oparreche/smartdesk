'use client';

import { useState, useTransition } from 'react';
import { updateLayoutAction } from '../actions';
import {
  newBlockTemplate,
  type Block,
  type BlockType,
  type LayoutConfig,
  type InfoCardBlock,
  type MetricBlock,
  type TableBlock,
  type AlertBlock,
  type ActionButtonBlock,
} from '@/src/services/layouts/schema';
import { PreviewPanel } from './preview-panel';

type Props = {
  id: string;
  initialName: string;
  initialIsDefault: boolean;
  initialConfig: LayoutConfig;
};

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  info_card: 'Card de informações',
  metric: 'Métrica',
  table: 'Tabela',
  alert: 'Alerta',
  action_button: 'Botão de ação',
};

export function LayoutEditor({ id, initialName, initialIsDefault, initialConfig }: Props) {
  const [name, setName] = useState(initialName);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [blocks, setBlocks] = useState<Block[]>(initialConfig.blocks);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [previewTicket, setPreviewTicket] = useState('');

  function addBlock(type: BlockType) {
    const blockId = `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setBlocks((prev) => [...prev, newBlockTemplate(type, blockId)]);
  }

  function removeBlock(blockId: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }

  function moveBlock(blockId: string, direction: 'up' | 'down') {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }

  function updateBlock(blockId: string, patch: Partial<Block>) {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? ({ ...b, ...patch } as Block) : b)));
  }

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set('id', id);
    fd.set('name', name);
    if (isDefault) fd.set('isDefault', 'on');
    fd.set('configJson', JSON.stringify({ blocks }));
    startTransition(async () => {
      try {
        await updateLayoutAction(fd);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        {/* Cabeçalho */}
        <section className="flex flex-wrap items-end gap-3 rounded-md border border-border p-4">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4"
            />
            Layout padrão
          </label>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
          {saved ? <span className="text-sm text-green-700">Salvo ✓</span> : null}
          {error ? <p className="basis-full text-sm text-destructive">{error}</p> : null}
        </section>

        {/* Lista de blocos */}
        <section className="flex flex-col gap-3">
          <header className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Blocos ({blocks.length})
            </h2>
            <AddBlockMenu onAdd={addBlock} />
          </header>

          {blocks.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Layout vazio — adicione blocos para começar.
            </p>
          ) : (
            blocks.map((b, idx) => (
              <BlockEditor
                key={b.id}
                block={b}
                isFirst={idx === 0}
                isLast={idx === blocks.length - 1}
                onMoveUp={() => moveBlock(b.id, 'up')}
                onMoveDown={() => moveBlock(b.id, 'down')}
                onRemove={() => removeBlock(b.id)}
                onUpdate={(patch) => updateBlock(b.id, patch)}
              />
            ))
          )}
        </section>
      </div>

      <PreviewPanel
        layoutId={id}
        config={{ blocks }}
        ticketCode={previewTicket}
        onTicketCodeChange={setPreviewTicket}
      />
    </div>
  );
}

// ─── Add menu ────────────────────────────────────────────────────

function AddBlockMenu({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        + Adicionar bloco
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-border bg-background shadow-md">
          {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onAdd(t);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            >
              {BLOCK_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Block editor (switch por tipo) ──────────────────────────────

function BlockEditor({
  block,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdate,
}: {
  block: Block;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<Block>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-border bg-background">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
              {BLOCK_TYPE_LABELS[block.type]}
            </span>
            {('title' in block && block.title) || ('message' in block && block.message) || ('label' in block && block.label) || '(sem título)'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onMoveUp} disabled={isFirst} className="rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-muted disabled:opacity-30">↑</button>
          <button type="button" onClick={onMoveDown} disabled={isLast} className="rounded-md border border-border px-1.5 py-0.5 text-xs hover:bg-muted disabled:opacity-30">↓</button>
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">{open ? 'Fechar' : 'Editar'}</button>
          <button type="button" onClick={onRemove} className="rounded-md border border-destructive/30 px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10">Excluir</button>
        </div>
      </header>

      {open ? (
        <div className="p-3">
          {block.type === 'info_card' ? <InfoCardEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} /> : null}
          {block.type === 'metric' ? <MetricEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} /> : null}
          {block.type === 'table' ? <TableEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} /> : null}
          {block.type === 'alert' ? <AlertEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} /> : null}
          {block.type === 'action_button' ? <ActionButtonEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} /> : null}
          <VisibleWhenEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} />
        </div>
      ) : null}
    </div>
  );
}

// ─── Sub-editores ───────────────────────────────────────────────

const FORMATS = ['text', 'number', 'currency', 'percentage', 'date', 'datetime', 'boolean', 'phone', 'document', 'email', 'url', 'badge'] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary';

function InfoCardEditor({ block, onUpdate }: { block: InfoCardBlock; onUpdate: (p: Partial<InfoCardBlock>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Título">
        <input value={block.title} onChange={(e) => onUpdate({ title: e.target.value })} className={inputClass} />
      </Field>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Campos</p>
        {block.fields.map((f, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_120px_auto] gap-2">
            <input
              value={f.label}
              placeholder="Label"
              onChange={(e) => {
                const fields = block.fields.slice();
                fields[i] = { ...fields[i], label: e.target.value };
                onUpdate({ fields });
              }}
              className={inputClass}
            />
            <input
              value={f.value}
              placeholder="{{partner.name}}"
              onChange={(e) => {
                const fields = block.fields.slice();
                fields[i] = { ...fields[i], value: e.target.value };
                onUpdate({ fields });
              }}
              className={`${inputClass} font-mono text-xs`}
            />
            <select
              value={f.format}
              onChange={(e) => {
                const fields = block.fields.slice();
                fields[i] = { ...fields[i], format: e.target.value as InfoCardBlock['fields'][number]['format'] };
                onUpdate({ fields });
              }}
              className={inputClass}
            >
              {FORMATS.map((fmt) => <option key={fmt} value={fmt}>{fmt}</option>)}
            </select>
            <button
              type="button"
              onClick={() => {
                const fields = block.fields.filter((_, idx) => idx !== i);
                if (fields.length === 0) fields.push({ label: 'Novo', value: '', format: 'text' });
                onUpdate({ fields });
              }}
              className="rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              −
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onUpdate({ fields: [...block.fields, { label: 'Novo', value: '', format: 'text' }] })}
          className="self-start rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          + Adicionar campo
        </button>
      </div>
    </div>
  );
}

function MetricEditor({ block, onUpdate }: { block: MetricBlock; onUpdate: (p: Partial<MetricBlock>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Título">
        <input value={block.title} onChange={(e) => onUpdate({ title: e.target.value })} className={inputClass} />
      </Field>
      <Field label="Valor (template)">
        <input
          value={block.value}
          onChange={(e) => onUpdate({ value: e.target.value })}
          className={`${inputClass} font-mono text-xs`}
          placeholder="{{partner.sales_last_30_days}}"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Formato">
          <select value={block.format} onChange={(e) => onUpdate({ format: e.target.value as MetricBlock['format'] })} className={inputClass}>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        {block.format === 'currency' ? (
          <Field label="Moeda">
            <input value={block.currency ?? 'BRL'} maxLength={3} onChange={(e) => onUpdate({ currency: e.target.value.toUpperCase() })} className={inputClass} />
          </Field>
        ) : null}
      </div>
    </div>
  );
}

function TableEditor({ block, onUpdate }: { block: TableBlock; onUpdate: (p: Partial<TableBlock>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Título">
        <input value={block.title} onChange={(e) => onUpdate({ title: e.target.value })} className={inputClass} />
      </Field>
      <Field label="Origem (array — template)">
        <input
          value={block.source}
          onChange={(e) => onUpdate({ source: e.target.value })}
          className={`${inputClass} font-mono text-xs`}
          placeholder="{{partner.brands}}"
        />
      </Field>
      <Field label="Mensagem se vazio">
        <input value={block.emptyMessage ?? ''} onChange={(e) => onUpdate({ emptyMessage: e.target.value })} className={inputClass} />
      </Field>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Colunas (value é relativo ao item do array)</p>
        {block.columns.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_120px_auto] gap-2">
            <input
              value={c.label}
              placeholder="Coluna"
              onChange={(e) => {
                const columns = block.columns.slice();
                columns[i] = { ...columns[i], label: e.target.value };
                onUpdate({ columns });
              }}
              className={inputClass}
            />
            <input
              value={c.value}
              placeholder="name"
              onChange={(e) => {
                const columns = block.columns.slice();
                columns[i] = { ...columns[i], value: e.target.value };
                onUpdate({ columns });
              }}
              className={`${inputClass} font-mono text-xs`}
            />
            <select
              value={c.format}
              onChange={(e) => {
                const columns = block.columns.slice();
                columns[i] = { ...columns[i], format: e.target.value as TableBlock['columns'][number]['format'] };
                onUpdate({ columns });
              }}
              className={inputClass}
            >
              {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <button
              type="button"
              onClick={() => {
                const columns = block.columns.filter((_, idx) => idx !== i);
                if (columns.length === 0) columns.push({ label: 'Nova', value: '', format: 'text' });
                onUpdate({ columns });
              }}
              className="rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              −
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onUpdate({ columns: [...block.columns, { label: 'Nova', value: '', format: 'text' }] })}
          className="self-start rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          + Adicionar coluna
        </button>
      </div>
    </div>
  );
}

function AlertEditor({ block, onUpdate }: { block: AlertBlock; onUpdate: (p: Partial<AlertBlock>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Variante">
        <select value={block.variant} onChange={(e) => onUpdate({ variant: e.target.value as AlertBlock['variant'] })} className={inputClass}>
          <option value="info">Info</option>
          <option value="success">Sucesso</option>
          <option value="warning">Aviso</option>
          <option value="destructive">Crítico</option>
        </select>
      </Field>
      <Field label="Mensagem (template)">
        <input value={block.message} onChange={(e) => onUpdate({ message: e.target.value })} className={inputClass} />
      </Field>
      <Field label="Ícone (emoji opcional)">
        <input value={block.icon ?? ''} onChange={(e) => onUpdate({ icon: e.target.value })} maxLength={4} className={inputClass} />
      </Field>
    </div>
  );
}

function ActionButtonEditor({ block, onUpdate }: { block: ActionButtonBlock; onUpdate: (p: Partial<ActionButtonBlock>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Rótulo">
        <input value={block.label} onChange={(e) => onUpdate({ label: e.target.value })} className={inputClass} />
      </Field>
      <Field label="URL (template)">
        <input
          value={block.url}
          onChange={(e) => onUpdate({ url: e.target.value })}
          className={`${inputClass} font-mono text-xs`}
          placeholder="https://app/{{partner.id}}"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estilo">
          <select value={block.variant} onChange={(e) => onUpdate({ variant: e.target.value as ActionButtonBlock['variant'] })} className={inputClass}>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="outline">Outline</option>
          </select>
        </Field>
        <Field label="Abrir em">
          <select value={block.openIn} onChange={(e) => onUpdate({ openIn: e.target.value as ActionButtonBlock['openIn'] })} className={inputClass}>
            <option value="new_tab">Nova aba</option>
            <option value="same_tab">Mesma aba</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

function VisibleWhenEditor({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  const cond = block.visibleWhen;
  const isSimple = cond && 'field' in cond;

  return (
    <details className="mt-3 border-t border-border pt-3">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        Condição de exibição {block.visibleWhen ? '(configurada)' : '(sempre visível)'}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {isSimple ? (
          <>
            <div className="grid grid-cols-[2fr_1fr_2fr_auto] gap-2">
              <input
                value={cond.field}
                placeholder="partner.status"
                onChange={(e) => onUpdate({ visibleWhen: { ...cond, field: e.target.value } })}
                className={`${inputClass} font-mono text-xs`}
              />
              <select
                value={cond.op}
                onChange={(e) => onUpdate({ visibleWhen: { ...cond, op: e.target.value as typeof cond.op } })}
                className={inputClass}
              >
                <option value="exists">existe</option>
                <option value="not_exists">não existe</option>
                <option value="empty">vazio</option>
                <option value="not_empty">não vazio</option>
                <option value="eq">igual</option>
                <option value="ne">diferente</option>
                <option value="gt">maior que</option>
                <option value="gte">maior ou igual</option>
                <option value="lt">menor que</option>
                <option value="lte">menor ou igual</option>
                <option value="contains">contém</option>
                <option value="not_contains">não contém</option>
              </select>
              <input
                value={cond.value === undefined ? '' : String(cond.value)}
                placeholder="valor"
                onChange={(e) => onUpdate({ visibleWhen: { ...cond, value: e.target.value } })}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => onUpdate({ visibleWhen: undefined })}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                Remover
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onUpdate({ visibleWhen: { field: 'partner.id', op: 'exists' } })}
            className="self-start rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            + Adicionar condição
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          Combinações <code>all/any/not</code> não estão expostas aqui no MVP — edite via JSON se precisar.
        </p>
      </div>
    </details>
  );
}
