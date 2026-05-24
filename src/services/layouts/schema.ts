import { z } from 'zod';

/**
 * Schemas Zod dos blocos do Painel Inteligente.
 *
 * Esta é a fonte da verdade — qualquer divergência em editor, render-prepare ou
 * componentes de UI deve ser tratada como bug a partir destes schemas.
 */

// ─── Formatos suportados ──────────────────────────────────────────

export const FormatSchema = z.enum([
  'text',
  'number',
  'currency',
  'percentage',
  'date',
  'datetime',
  'boolean',
  'phone',
  'document',
  'email',
  'url',
  'badge',
]);
export type Format = z.infer<typeof FormatSchema>;

// ─── Condition DSL (visibleWhen) ───────────────────────────────────

const OperatorSchema = z.enum([
  'exists', 'not_exists', 'empty', 'not_empty',
  'eq', 'ne',
  'gt', 'gte', 'lt', 'lte',
  'contains', 'not_contains',
  'in', 'not_in',
]);

const SimpleConditionSchema = z.object({
  field: z.string().min(1),
  op: OperatorSchema,
  value: z.unknown().optional(),
});

export type Condition = z.infer<typeof SimpleConditionSchema> | { all: Condition[] } | { any: Condition[] } | { not: Condition };

// recursive zod via lazy
export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    SimpleConditionSchema,
    z.object({ all: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ any: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ not: ConditionSchema }).strict(),
  ]),
);

// ─── Blocos ───────────────────────────────────────────────────────

const BadgeMapSchema = z.record(z.string(), z.string()).optional();

const InfoFieldSchema = z.object({
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(500),
  format: FormatSchema.default('text'),
  currency: z.string().length(3).optional(),
  badgeMap: BadgeMapSchema,
});

export const InfoCardBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('info_card'),
  title: z.string().min(1).max(120),
  visibleWhen: ConditionSchema.optional(),
  fields: z.array(InfoFieldSchema).min(1).max(20),
});

export const MetricBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('metric'),
  title: z.string().min(1).max(120),
  visibleWhen: ConditionSchema.optional(),
  value: z.string().min(1),
  format: FormatSchema.default('number'),
  currency: z.string().length(3).optional(),
  trend: z
    .object({
      value: z.string().min(1),
      format: FormatSchema.default('percentage'),
      label: z.string().max(50).optional(),
    })
    .optional(),
});

const TableColumnSchema = z.object({
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(200),
  format: FormatSchema.default('text'),
  currency: z.string().length(3).optional(),
});

export const TableBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('table'),
  title: z.string().min(1).max(120),
  visibleWhen: ConditionSchema.optional(),
  source: z.string().min(1).max(200),
  emptyMessage: z.string().max(200).optional(),
  columns: z.array(TableColumnSchema).min(1).max(8),
});

export const AlertBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('alert'),
  variant: z.enum(['info', 'success', 'warning', 'destructive']).default('info'),
  message: z.string().min(1).max(500),
  icon: z.string().max(40).optional(),
  visibleWhen: ConditionSchema.optional(),
});

export const ActionButtonBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('action_button'),
  label: z.string().min(1).max(80),
  url: z.string().min(1).max(500),
  variant: z.enum(['primary', 'secondary', 'outline']).default('primary'),
  openIn: z.enum(['new_tab', 'same_tab']).default('new_tab'),
  visibleWhen: ConditionSchema.optional(),
});

export const BlockSchema = z.discriminatedUnion('type', [
  InfoCardBlockSchema,
  MetricBlockSchema,
  TableBlockSchema,
  AlertBlockSchema,
  ActionButtonBlockSchema,
]);

export type Block = z.infer<typeof BlockSchema>;
export type InfoCardBlock = z.infer<typeof InfoCardBlockSchema>;
export type MetricBlock = z.infer<typeof MetricBlockSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
export type AlertBlock = z.infer<typeof AlertBlockSchema>;
export type ActionButtonBlock = z.infer<typeof ActionButtonBlockSchema>;

export type BlockType = Block['type'];

// ─── Layout completo ──────────────────────────────────────────────

export const LayoutConfigSchema = z.object({
  blocks: z.array(BlockSchema).max(50),
});

export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;

// ─── Helpers para criar blocos vazios (templates) ─────────────────

export function newBlockTemplate(type: BlockType, id: string): Block {
  switch (type) {
    case 'info_card':
      return {
        id,
        type: 'info_card',
        title: 'Dados do solicitante',
        fields: [{ label: 'Nome', value: '{{ticket.requester.name}}', format: 'text' }],
      };
    case 'metric':
      return {
        id,
        type: 'metric',
        title: 'Métrica',
        value: '{{partner.sales_last_30_days}}',
        format: 'currency',
        currency: 'BRL',
      };
    case 'table':
      return {
        id,
        type: 'table',
        title: 'Itens',
        source: '{{partner.brands}}',
        emptyMessage: 'Sem dados',
        columns: [
          { label: 'Nome', value: 'name', format: 'text' },
          { label: 'Vendas', value: 'sales', format: 'currency', currency: 'BRL' },
        ],
      };
    case 'alert':
      return {
        id,
        type: 'alert',
        variant: 'warning',
        message: 'Atenção: campo a configurar.',
        visibleWhen: { field: 'partner.status', op: 'eq', value: 'active' },
      };
    case 'action_button':
      return {
        id,
        type: 'action_button',
        label: 'Abrir no sistema externo',
        url: 'https://app.empresa.com/{{partner.id}}',
        variant: 'primary',
        openIn: 'new_tab',
      };
  }
}
