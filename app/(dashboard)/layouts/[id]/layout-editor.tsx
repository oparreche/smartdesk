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

const BLOCK_TYPE_ICON: Record<BlockType, string> = {
  info_card: '▤',
  metric: '＃',
  table: '▦',
  alert: '⚠',
  action_button: '⬡',
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
      <div className="flex flex-col gap-5">
        {/* 01 — Identificação */}
        <Section eyebrow="01" title="Identificação">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_auto]">
            <Field label="Nome do painel">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />
            </Field>
            <div className="flex items-end">
              <Toggle
                active={isDefault}
                onChange={setIsDefault}
                label="Layout padrão"
                hint="usado quando nenhum outro casa"
              />
            </div>
          </div>
        </Section>

        {/* 02 — Blocos */}
        <Section
          eyebrow="02"
          title={`Blocos · ${blocks.length}`}
          hint="Renderizados de cima pra baixo no painel do ticket."
          right={<AddBlockMenu onAdd={addBlock} />}
        >
          {blocks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-sm border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
              <span className="text-2xl">▤</span>
              <p className="text-sm font-medium text-foreground">Painel vazio</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Adicione blocos (cards, métricas, tabelas, alertas) para montar o painel inteligente.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {blocks.map((b, idx) => (
                <BlockEditor
                  key={b.id}
                  index={idx + 1}
                  block={b}
                  isFirst={idx === 0}
                  isLast={idx === blocks.length - 1}
                  onMoveUp={() => moveBlock(b.id, 'up')}
                  onMoveDown={() => moveBlock(b.id, 'down')}
                  onRemove={() => removeBlock(b.id)}
                  onUpdate={(patch) => updateBlock(b.id, patch)}
                />
              ))}
            </ol>
          )}
        </Section>

        {/* Footer de salvar (sticky) */}
        <div className="sticky bottom-4 z-10 rounded-md border border-border bg-surface/95 px-4 py-3 shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 text-xs">
              {error ? (
                <span className="text-destructive">⚠ {error}</span>
              ) : saved ? (
                <span className="text-success">✓ Alterações salvas</span>
              ) : (
                <span className="text-muted-foreground">
                  Edição local — clique em <span className="font-medium text-foreground">Salvar</span> pra publicar.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex shrink-0 items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px disabled:opacity-60"
            >
              {pending ? 'Salvando…' : 'Salvar painel'}
            </button>
          </div>
        </div>
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
        className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-md"
      >
        <span aria-hidden>＋</span> Adicionar bloco
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-20 mt-1.5 w-60 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
            {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onAdd(t);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary-soft text-xs text-primary">
                  {BLOCK_TYPE_ICON[t]}
                </span>
                {BLOCK_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Block editor (switch por tipo) ──────────────────────────────

function BlockEditor({
  index,
  block,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdate,
}: {
  index: number;
  block: Block;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<Block>) => void;
}) {
  const [open, setOpen] = useState(false);
  const title =
    ('title' in block && block.title) ||
    ('message' in block && block.message) ||
    ('label' in block && block.label) ||
    '(sem título)';

  return (
    <li className="overflow-hidden rounded-sm border border-border bg-surface-raised shadow-xs transition-colors hover:border-border-strong">
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="numeral-serif flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[0.75rem] font-medium text-primary-foreground">
            {index}
          </span>
          <span aria-hidden className="text-base text-primary">{BLOCK_TYPE_ICON[block.type]}</span>
          <div className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{title}</span>
            <span className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {BLOCK_TYPE_LABELS[block.type]}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconBtn onClick={onMoveUp} disabled={isFirst} title="Mover pra cima">↑</IconBtn>
          <IconBtn onClick={onMoveDown} disabled={isLast} title="Mover pra baixo">↓</IconBtn>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-foreground-secondary hover:bg-muted hover:text-foreground"
          >
            {open ? 'Fechar' : 'Editar'}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
            title="Excluir bloco"
          >
            ✕
          </button>
        </div>
      </header>

      {open ? (
        <div className="border-t border-border-subtle bg-surface px-3 py-3">
          {block.type === 'info_card' ? <InfoCardEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} /> : null}
          {block.type === 'metric' ? <MetricEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} /> : null}
          {block.type === 'table' ? <TableEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} /> : null}
          {block.type === 'alert' ? <AlertEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} /> : null}
          {block.type === 'action_button' ? <ActionButtonEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} /> : null}
          <VisibleWhenEditor block={block} onUpdate={(p) => onUpdate(p as Partial<Block>)} />
        </div>
      ) : null}
    </li>
  );
}

function IconBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-sm border border-border bg-surface px-1.5 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

// ─── Sub-editores ───────────────────────────────────────────────

const FORMATS = ['text', 'number', 'currency', 'percentage', 'date', 'datetime', 'boolean', 'phone', 'document', 'email', 'url', 'badge'] as const;

function Section({
  eyebrow,
  title,
  hint,
  right,
  children,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="divider-eyebrow text-muted-foreground">
            <span className="numeral-serif text-[0.6875rem] text-primary">{eyebrow}</span>
            <span className="mx-1.5 opacity-40">·</span>
            {title}
          </p>
          {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {right}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Toggle({
  active,
  onChange,
  label,
  hint,
}: {
  active: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-success bg-success-soft text-success'
          : 'border-border bg-surface-raised text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${active ? 'border-current bg-current/20' : 'border-current'}`}
        aria-hidden
      >
        {active ? <span className="text-[0.625rem] leading-none">✓</span> : null}
      </span>
      {label}
      {hint ? <span className="opacity-60">· {hint}</span> : null}
    </button>
  );
}

const inputClass =
  'w-full rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

function SelectBox({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} appearance-none pr-8`}>
        {children}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        ▾
      </span>
    </div>
  );
}

function RemoveRowBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remover"
      className="self-stretch rounded-sm border border-border bg-surface px-2 text-xs text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
    >
      −
    </button>
  );
}

function AddRowBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 self-start rounded-sm border border-dashed border-primary/40 bg-primary-soft/40 px-3 py-1.5 text-xs font-medium text-primary hover:border-primary hover:bg-primary-soft"
    >
      <span aria-hidden>＋</span> {children}
    </button>
  );
}

function InfoCardEditor({ block, onUpdate }: { block: InfoCardBlock; onUpdate: (p: Partial<InfoCardBlock>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Título">
        <input value={block.title} onChange={(e) => onUpdate({ title: e.target.value })} className={inputClass} />
      </Field>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-foreground-secondary">Campos</p>
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
            <SelectBox
              value={f.format}
              onChange={(v) => {
                const fields = block.fields.slice();
                fields[i] = { ...fields[i], format: v as InfoCardBlock['fields'][number]['format'] };
                onUpdate({ fields });
              }}
            >
              {FORMATS.map((fmt) => <option key={fmt} value={fmt}>{fmt}</option>)}
            </SelectBox>
            <RemoveRowBtn
              onClick={() => {
                const fields = block.fields.filter((_, idx) => idx !== i);
                if (fields.length === 0) fields.push({ label: 'Novo', value: '', format: 'text' });
                onUpdate({ fields });
              }}
            />
          </div>
        ))}
        <AddRowBtn onClick={() => onUpdate({ fields: [...block.fields, { label: 'Novo', value: '', format: 'text' }] })}>
          Adicionar campo
        </AddRowBtn>
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
          <SelectBox value={block.format} onChange={(v) => onUpdate({ format: v as MetricBlock['format'] })}>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </SelectBox>
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
        <p className="text-xs font-medium text-foreground-secondary">Colunas <span className="font-normal text-muted-foreground">(value é relativo ao item do array)</span></p>
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
            <SelectBox
              value={c.format}
              onChange={(v) => {
                const columns = block.columns.slice();
                columns[i] = { ...columns[i], format: v as TableBlock['columns'][number]['format'] };
                onUpdate({ columns });
              }}
            >
              {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </SelectBox>
            <RemoveRowBtn
              onClick={() => {
                const columns = block.columns.filter((_, idx) => idx !== i);
                if (columns.length === 0) columns.push({ label: 'Nova', value: '', format: 'text' });
                onUpdate({ columns });
              }}
            />
          </div>
        ))}
        <AddRowBtn onClick={() => onUpdate({ columns: [...block.columns, { label: 'Nova', value: '', format: 'text' }] })}>
          Adicionar coluna
        </AddRowBtn>
      </div>
    </div>
  );
}

function AlertEditor({ block, onUpdate }: { block: AlertBlock; onUpdate: (p: Partial<AlertBlock>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Variante">
        <SelectBox value={block.variant} onChange={(v) => onUpdate({ variant: v as AlertBlock['variant'] })}>
          <option value="info">Info</option>
          <option value="success">Sucesso</option>
          <option value="warning">Aviso</option>
          <option value="destructive">Crítico</option>
        </SelectBox>
      </Field>
      <Field label="Mensagem (template)">
        <input value={block.message} onChange={(e) => onUpdate({ message: e.target.value })} className={inputClass} />
      </Field>
      <Field label="Ícone (emoji opcional)">
        <input value={block.icon ?? ''} onChange={(e) => onUpdate({ icon: e.target.value })} maxLength={4} className={`${inputClass} w-24`} />
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
          <SelectBox value={block.variant} onChange={(v) => onUpdate({ variant: v as ActionButtonBlock['variant'] })}>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="outline">Outline</option>
          </SelectBox>
        </Field>
        <Field label="Abrir em">
          <SelectBox value={block.openIn} onChange={(v) => onUpdate({ openIn: v as ActionButtonBlock['openIn'] })}>
            <option value="new_tab">Nova aba</option>
            <option value="same_tab">Mesma aba</option>
          </SelectBox>
        </Field>
      </div>
    </div>
  );
}

function VisibleWhenEditor({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  const cond = block.visibleWhen;
  const isSimple = cond && 'field' in cond;

  return (
    <details className="mt-3 border-t border-border-subtle pt-3">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        Condição de exibição {block.visibleWhen ? '(configurada)' : '(sempre visível)'}
      </summary>
      <div className="mt-2.5 flex flex-col gap-2">
        {isSimple ? (
          <div className="grid grid-cols-[2fr_1fr_2fr_auto] gap-2">
            <input
              value={cond.field}
              placeholder="partner.status"
              onChange={(e) => onUpdate({ visibleWhen: { ...cond, field: e.target.value } })}
              className={`${inputClass} font-mono text-xs`}
            />
            <SelectBox value={cond.op} onChange={(v) => onUpdate({ visibleWhen: { ...cond, op: v as typeof cond.op } })}>
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
            </SelectBox>
            <input
              value={cond.value === undefined ? '' : String(cond.value)}
              placeholder="valor"
              onChange={(e) => onUpdate({ visibleWhen: { ...cond, value: e.target.value } })}
              className={inputClass}
            />
            <RemoveRowBtn onClick={() => onUpdate({ visibleWhen: undefined })} />
          </div>
        ) : (
          <AddRowBtn onClick={() => onUpdate({ visibleWhen: { field: 'partner.id', op: 'exists' } })}>
            Adicionar condição
          </AddRowBtn>
        )}
        <p className="text-[0.6875rem] text-muted-foreground">
          Combinações <code className="rounded-sm bg-muted px-1 font-mono">all/any/not</code> não estão expostas aqui no MVP — edite via JSON se precisar.
        </p>
      </div>
    </details>
  );
}
