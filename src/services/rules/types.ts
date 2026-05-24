import { z } from 'zod';
import { ConditionSchema } from '@/src/services/layouts/schema';

export { ActionSchema, RuleTriggerSchema, RuleDefinitionSchema } from './schema';
export type { Action, RuleTrigger, RuleDefinition } from './schema';

/**
 * Aceita conditions vindo do banco: null/undefined viram undefined (sempre match);
 * objeto JSON válido vira Condition.
 */
export const ConditionFromDb = z
  .union([z.null(), z.undefined(), ConditionSchema])
  .transform((v) => (v ?? undefined));
