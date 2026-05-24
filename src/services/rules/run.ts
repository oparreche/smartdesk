import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { evaluateCondition } from '@/src/lib/condition-eval';
import { buildTicketContext } from '@/src/services/enrichment/context';
import { ActionSchema, ConditionFromDb, type RuleTrigger } from './types';
import { executeAction, type ActionResult } from './actions';

export type RunRulesInput = {
  organizationId: string;
  ticketId: string;
  trigger: RuleTrigger;
  /** Variáveis extras (form values, etc). */
  extra?: Record<string, unknown>;
};

export type RunRulesResult = {
  trigger: RuleTrigger;
  evaluated: number;
  matched: number;
  applied: number;
  details: Array<{
    ruleId: string;
    ruleName: string;
    matched: boolean;
    actions: Array<{ type: string; result: ActionResult }>;
    stoppedAfter: boolean;
  }>;
};

/**
 * Carrega regras `enabled` para o trigger e executa contra um ticket.
 *
 * Erros isolados por regra/ação — uma falha não derruba o restante.
 * Cada execução cria evento `rule_applied` no ticket (com summary das ações).
 */
export async function runRules(input: RunRulesInput): Promise<RunRulesResult> {
  const rules = await prisma.automationRule.findMany({
    where: {
      organizationId: input.organizationId,
      enabled: true,
      trigger: input.trigger as never,
      deletedAt: null,
    },
    orderBy: [{ runOrder: 'asc' }, { createdAt: 'asc' }],
  });

  if (rules.length === 0) {
    return { trigger: input.trigger, evaluated: 0, matched: 0, applied: 0, details: [] };
  }

  const ctx = await buildTicketContext(input.organizationId, input.ticketId, input.extra);

  const details: RunRulesResult['details'] = [];
  let matched = 0;
  let appliedCount = 0;

  for (const rule of rules) {
    const conditionsParsed = ConditionFromDb.safeParse(rule.conditions);
    if (!conditionsParsed.success) {
      logger.warn({ ruleId: rule.id, err: conditionsParsed.error }, 'rule conditions invalid, skipping');
      continue;
    }
    const condResult = evaluateCondition(conditionsParsed.data, ctx);
    if (!condResult) {
      details.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matched: false,
        actions: [],
        stoppedAfter: false,
      });
      continue;
    }

    matched += 1;

    const actionsRaw = Array.isArray(rule.actions) ? rule.actions : [];
    const actionResults: Array<{ type: string; result: ActionResult }> = [];

    for (const rawAction of actionsRaw) {
      const parsed = ActionSchema.safeParse(rawAction);
      if (!parsed.success) {
        actionResults.push({
          type: 'invalid',
          result: { ok: false, error: 'invalid_action_schema' },
        });
        continue;
      }
      const r = await executeAction(parsed.data, {
        organizationId: input.organizationId,
        ticketId: input.ticketId,
        ruleId: rule.id,
        ruleName: rule.name,
        ctx,
      });
      actionResults.push({ type: parsed.data.type, result: r });
      if (r.ok) appliedCount += 1;
    }

    // Registra evento "rule_applied" agregado
    await prisma.ticketEvent.create({
      data: {
        organizationId: input.organizationId,
        ticketId: input.ticketId,
        type: 'rule_applied',
        payload: {
          ruleId: rule.id,
          ruleName: rule.name,
          trigger: input.trigger,
          actions: actionResults.map((a) => ({
            type: a.type,
            ok: a.result.ok,
            summary: a.result.ok ? a.result.summary : a.result.error,
          })),
        } as Prisma.InputJsonObject,
      },
    });

    details.push({
      ruleId: rule.id,
      ruleName: rule.name,
      matched: true,
      actions: actionResults,
      stoppedAfter: rule.stopAfterMatch,
    });

    if (rule.stopAfterMatch) {
      break;
    }
  }

  logger.info(
    {
      org: input.organizationId,
      ticketId: input.ticketId,
      trigger: input.trigger,
      evaluated: rules.length,
      matched,
      applied: appliedCount,
    },
    'rules.run done',
  );

  return {
    trigger: input.trigger,
    evaluated: rules.length,
    matched,
    applied: appliedCount,
    details,
  };
}
