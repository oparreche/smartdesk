import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';
import { RuleDefinitionSchema, type RuleDefinition } from './schema';

export async function listRules(organizationId: string) {
  return prisma.automationRule.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ enabled: 'desc' }, { runOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      enabled: true,
      trigger: true,
      runOrder: true,
      stopAfterMatch: true,
      updatedAt: true,
    },
  });
}

export async function getRule(organizationId: string, ruleId: string) {
  return prisma.automationRule.findFirst({
    where: { id: ruleId, organizationId, deletedAt: null },
  });
}

export async function createRule(
  organizationId: string,
  actorUserId: string,
  input: RuleDefinition,
): Promise<{ id: string }> {
  RuleDefinitionSchema.parse(input);

  const created = await prisma.automationRule.create({
    data: {
      organizationId,
      name: input.name.trim(),
      enabled: input.enabled,
      trigger: input.trigger as never,
      conditions: input.conditions
        ? (JSON.parse(JSON.stringify(input.conditions)) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      actions: JSON.parse(JSON.stringify(input.actions)) as Prisma.InputJsonValue,
      runOrder: input.runOrder,
      stopAfterMatch: input.stopAfterMatch,
    },
    select: { id: true },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'rule.created',
    resourceType: 'rule',
    resourceId: created.id,
    diff: { after: { name: input.name, trigger: input.trigger, actions: input.actions.length } },
  });

  return created;
}

export async function updateRule(
  organizationId: string,
  actorUserId: string,
  ruleId: string,
  input: RuleDefinition,
): Promise<void> {
  RuleDefinitionSchema.parse(input);

  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, organizationId, deletedAt: null },
    select: { id: true, name: true, trigger: true },
  });
  if (!existing) throw new Error('Regra não encontrada');

  await prisma.automationRule.update({
    where: { id: ruleId },
    data: {
      name: input.name.trim(),
      enabled: input.enabled,
      trigger: input.trigger as never,
      conditions: input.conditions
        ? (JSON.parse(JSON.stringify(input.conditions)) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      actions: JSON.parse(JSON.stringify(input.actions)) as Prisma.InputJsonValue,
      runOrder: input.runOrder,
      stopAfterMatch: input.stopAfterMatch,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'rule.updated',
    resourceType: 'rule',
    resourceId: ruleId,
    diff: { before: existing, after: { name: input.name, trigger: input.trigger } },
  });
}

export async function deleteRule(
  organizationId: string,
  actorUserId: string,
  ruleId: string,
): Promise<void> {
  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) throw new Error('Regra não encontrada');

  await prisma.automationRule.update({
    where: { id: ruleId },
    data: { deletedAt: new Date(), enabled: false },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'rule.deleted',
    resourceType: 'rule',
    resourceId: ruleId,
    diff: { before: existing },
  });
}
