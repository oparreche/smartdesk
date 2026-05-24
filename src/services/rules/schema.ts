import { z } from 'zod';
import { ConditionSchema } from '@/src/services/layouts/schema';

/**
 * Schemas das regras de automação.
 *
 * Triggers possíveis:
 *  - ticket_created
 *  - ticket_updated
 *  - ticket_enriched
 *  - email_received
 *  - form_submitted
 *
 * Actions (discriminated union):
 *  - set_priority { value }
 *  - set_status { value }
 *  - add_tag { value }
 *  - remove_tag { value }
 *  - assign_queue { queueSlug }
 *  - assign_user { email }
 *  - add_internal_note { body } — suporta {{vars}}
 *  - add_alert { variant, message } — guarda em ticket.customFields._alerts
 */

export const RuleTriggerSchema = z.enum([
  'ticket_created',
  'ticket_updated',
  'ticket_enriched',
  'email_received',
  'form_submitted',
]);

export type RuleTrigger = z.infer<typeof RuleTriggerSchema>;

const PrioritySchema = z.enum(['low', 'normal', 'high', 'urgent', 'critical']);
const StatusSchema = z.enum([
  'new', 'open', 'in_progress', 'pending_customer', 'pending_third_party',
  'resolved', 'closed', 'cancelled',
]);

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_priority'), value: PrioritySchema }),
  z.object({ type: z.literal('set_status'), value: StatusSchema }),
  z.object({ type: z.literal('add_tag'), value: z.string().min(1).max(60) }),
  z.object({ type: z.literal('remove_tag'), value: z.string().min(1).max(60) }),
  z.object({ type: z.literal('assign_queue'), queueSlug: z.string().min(1).max(60) }),
  z.object({ type: z.literal('assign_user'), email: z.string().email() }),
  z.object({
    type: z.literal('assign_round_robin'),
    /** Slug da fila — só agentes membros dessa fila entram no rodízio. Default: a fila do ticket. */
    queueSlug: z.string().min(1).max(60).optional(),
    /** Se true, considera workload atual (assignee de tickets abertos) pra balancear. */
    balanceByWorkload: z.boolean().default(true).optional(),
  }),
  z.object({
    type: z.literal('add_internal_note'),
    body: z.string().min(1).max(5000),
  }),
  z.object({
    type: z.literal('add_alert'),
    variant: z.enum(['info', 'success', 'warning', 'destructive']).default('info'),
    message: z.string().min(1).max(500),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;

export const RuleConditionsSchema = z.union([
  ConditionSchema,
  // Permite array vazio significando "sempre"
  z.array(z.never()).length(0).transform(() => undefined),
]);

export const RuleDefinitionSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  trigger: RuleTriggerSchema,
  conditions: ConditionSchema.optional(),
  actions: z.array(ActionSchema).min(1).max(10),
  runOrder: z.number().int().min(0).max(1000).default(0),
  stopAfterMatch: z.boolean().default(false),
});

export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;
