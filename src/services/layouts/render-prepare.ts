import 'server-only';
import { evaluateCondition } from '@/src/lib/condition-eval';
import { formatValue } from '@/src/lib/format-value';
import { getPath, renderTemplate } from '@/src/services/integrations/template';
import type {
  Block,
  InfoCardBlock,
  MetricBlock,
  TableBlock,
  AlertBlock,
  ActionButtonBlock,
  LayoutConfig,
} from './schema';

/**
 * Bloco "renderizável" — versão preparada do bloco com:
 *  - Variáveis resolvidas
 *  - visibleWhen avaliado (visible: true|false)
 *  - Valores formatados (strings prontas)
 */

export type RenderableBlock =
  | RenderableInfoCard
  | RenderableMetric
  | RenderableTable
  | RenderableAlert
  | RenderableActionButton;

export type RenderableInfoCard = {
  id: string;
  type: 'info_card';
  visible: boolean;
  title: string;
  fields: { label: string; value: string; raw: unknown; badgeColor?: string }[];
};

export type RenderableMetric = {
  id: string;
  type: 'metric';
  visible: boolean;
  title: string;
  value: string;
  trend?: { value: string; label?: string };
};

export type RenderableTable = {
  id: string;
  type: 'table';
  visible: boolean;
  title: string;
  rows: { cells: { value: string; raw: unknown }[] }[];
  columnLabels: string[];
  emptyMessage?: string;
};

export type RenderableAlert = {
  id: string;
  type: 'alert';
  visible: boolean;
  variant: 'info' | 'success' | 'warning' | 'destructive';
  message: string;
  icon?: string;
};

export type RenderableActionButton = {
  id: string;
  type: 'action_button';
  visible: boolean;
  label: string;
  url: string;
  variant: 'primary' | 'secondary' | 'outline';
  openIn: 'new_tab' | 'same_tab';
};

export type PrepareOptions = {
  /** Se true, retorna blocos invisíveis também (com visible=false). Útil pro preview do editor. */
  includeHidden?: boolean;
};

export function prepareLayout(
  config: LayoutConfig,
  context: Record<string, unknown>,
  options: PrepareOptions = {},
): RenderableBlock[] {
  const out: RenderableBlock[] = [];
  for (const block of config.blocks) {
    const visible = evaluateCondition(block.visibleWhen, context);
    if (!visible && !options.includeHidden) continue;

    try {
      out.push(prepareBlock(block, context, visible));
    } catch (err) {
      // Isolar erros por bloco — um bloco quebrado não derruba o painel.
      out.push({
        id: block.id,
        type: 'alert',
        visible: true,
        variant: 'destructive',
        message: `Erro ao renderizar bloco "${block.id}": ${(err as Error).message}`,
      });
    }
  }
  return out;
}

function prepareBlock(block: Block, ctx: Record<string, unknown>, visible: boolean): RenderableBlock {
  switch (block.type) {
    case 'info_card': return prepareInfoCard(block, ctx, visible);
    case 'metric': return prepareMetric(block, ctx, visible);
    case 'table': return prepareTable(block, ctx, visible);
    case 'alert': return prepareAlert(block, ctx, visible);
    case 'action_button': return prepareActionButton(block, ctx, visible);
  }
}

function prepareInfoCard(b: InfoCardBlock, ctx: Record<string, unknown>, visible: boolean): RenderableInfoCard {
  return {
    id: b.id,
    type: 'info_card',
    visible,
    title: renderTemplate(b.title, ctx),
    fields: b.fields.map((f) => {
      const raw = resolveTemplateValue(f.value, ctx);
      const formatted = formatValue(raw, f.format, { currency: f.currency });
      const badgeColor = f.format === 'badge' && f.badgeMap
        ? f.badgeMap[String(raw).toLowerCase()] ?? f.badgeMap[String(raw)] ?? undefined
        : undefined;
      return { label: f.label, value: formatted, raw, badgeColor };
    }),
  };
}

function prepareMetric(b: MetricBlock, ctx: Record<string, unknown>, visible: boolean): RenderableMetric {
  const raw = resolveTemplateValue(b.value, ctx);
  const value = formatValue(raw, b.format, { currency: b.currency });
  let trend: { value: string; label?: string } | undefined;
  if (b.trend) {
    const tRaw = resolveTemplateValue(b.trend.value, ctx);
    trend = {
      value: formatValue(tRaw, b.trend.format, {}),
      label: b.trend.label,
    };
  }
  return {
    id: b.id,
    type: 'metric',
    visible,
    title: renderTemplate(b.title, ctx),
    value,
    trend,
  };
}

function prepareTable(b: TableBlock, ctx: Record<string, unknown>, visible: boolean): RenderableTable {
  const rawSource = resolveTemplateValue(b.source, ctx);
  const items = Array.isArray(rawSource) ? rawSource : [];
  return {
    id: b.id,
    type: 'table',
    visible,
    title: renderTemplate(b.title, ctx),
    columnLabels: b.columns.map((c) => c.label),
    rows: items.map((item) => ({
      cells: b.columns.map((col) => {
        const raw = typeof item === 'object' && item !== null
          ? getPath(item, col.value)
          : null;
        return {
          value: formatValue(raw, col.format, { currency: col.currency }),
          raw,
        };
      }),
    })),
    emptyMessage: b.emptyMessage,
  };
}

function prepareAlert(b: AlertBlock, ctx: Record<string, unknown>, visible: boolean): RenderableAlert {
  return {
    id: b.id,
    type: 'alert',
    visible,
    variant: b.variant,
    message: renderTemplate(b.message, ctx),
    icon: b.icon,
  };
}

function prepareActionButton(b: ActionButtonBlock, ctx: Record<string, unknown>, visible: boolean): RenderableActionButton {
  return {
    id: b.id,
    type: 'action_button',
    visible,
    label: renderTemplate(b.label, ctx),
    url: renderTemplate(b.url, ctx),
    variant: b.variant,
    openIn: b.openIn,
  };
}

/**
 * Resolve um "valor" que pode ser:
 *  - Caminho puro tipo `partner.brands` (sem chaves duplas)
 *  - String com `{{var}}` que retorna o objeto raw (se for só uma var) ou string
 */
function resolveTemplateValue(value: string, ctx: Record<string, unknown>): unknown {
  if (!value) return '';
  const trimmed = value.trim();
  // Se for puramente `{{path}}` (uma única var), retorna o valor raw (objeto/array/etc)
  const m = trimmed.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (m) {
    return getPath(ctx, m[1].trim());
  }
  // Caso contrário, string com possíveis interpolações
  return renderTemplate(value, ctx);
}
