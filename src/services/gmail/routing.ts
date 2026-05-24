import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

export type RoutingMatch =
  | { action: 'ignore'; ruleId: string; pattern: string }
  | { action: 'tag'; ruleId: string; pattern: string; tagName: string };

const PATTERN_MAX = 255;
const TAG_MAX = 60;
const NOTE_MAX = 500;
const PER_ORG_LIMIT = 200;

/**
 * Converte um glob simples (com `*` e `?`) em RegExp.
 * Ex.: `*@99freelas.com.br` → /^.*@99freelas\.com\.br$/i
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function extractEmail(from: string): string {
  // Aceita "Nome <email@x>" ou só "email@x"
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

/**
 * Decide o que fazer com um email recebido. Retorna a primeira regra que casa
 * (ordenadas: ignore primeiro, depois tag) ou null pra processar normal.
 */
export async function matchSender(
  organizationId: string,
  fromHeader: string,
): Promise<RoutingMatch | null> {
  const email = extractEmail(fromHeader);
  if (!email) return null;

  const rules = await prisma.emailRoutingRule.findMany({
    where: { organizationId, enabled: true, deletedAt: null },
    orderBy: [{ action: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      pattern: true,
      action: true,
      tagName: true,
    },
  });

  for (const r of rules) {
    let re: RegExp;
    try {
      re = globToRegex(r.pattern);
    } catch {
      continue;
    }
    if (!re.test(email)) continue;

    // Bump counter best-effort, não bloqueia o fluxo
    prisma.emailRoutingRule
      .update({
        where: { id: r.id },
        data: { matchCount: { increment: 1 }, lastMatchedAt: new Date() },
      })
      .catch(() => {});

    if (r.action === 'ignore') {
      return { action: 'ignore', ruleId: r.id, pattern: r.pattern };
    }
    if (r.action === 'tag' && r.tagName) {
      return {
        action: 'tag',
        ruleId: r.id,
        pattern: r.pattern,
        tagName: r.tagName,
      };
    }
  }

  return null;
}

export async function listRules(organizationId: string) {
  return prisma.emailRoutingRule.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      pattern: true,
      action: true,
      tagName: true,
      enabled: true,
      note: true,
      matchCount: true,
      lastMatchedAt: true,
      createdAt: true,
    },
  });
}

export type CreateRuleInput = {
  pattern: string;
  action: 'ignore' | 'tag';
  tagName?: string | null;
  note?: string | null;
};

export async function createRule(
  organizationId: string,
  actorUserId: string,
  input: CreateRuleInput,
): Promise<{ id: string }> {
  const pattern = input.pattern.trim().slice(0, PATTERN_MAX).toLowerCase();
  if (!pattern) throw new Error('Pattern obrigatório');

  // Valida que o glob compila
  try {
    globToRegex(pattern);
  } catch {
    throw new Error('Pattern inválido');
  }

  if (input.action === 'tag' && !input.tagName?.trim()) {
    throw new Error('Tag é obrigatória quando ação é "Aplicar tag"');
  }

  const total = await prisma.emailRoutingRule.count({
    where: { organizationId, deletedAt: null },
  });
  if (total >= PER_ORG_LIMIT) {
    throw new Error(`Limite de ${PER_ORG_LIMIT} regras atingido`);
  }

  const created = await prisma.emailRoutingRule.create({
    data: {
      organizationId,
      pattern,
      action: input.action,
      tagName: input.action === 'tag' ? input.tagName!.trim().slice(0, TAG_MAX) : null,
      note: input.note?.trim().slice(0, NOTE_MAX) || null,
      createdById: actorUserId,
    },
    select: { id: true },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'email_routing.create',
    resourceType: 'email_routing_rule',
    resourceId: created.id,
    diff: { after: { pattern, action: input.action, tagName: input.tagName ?? null } },
  });

  return created;
}

export async function toggleRule(
  organizationId: string,
  actorUserId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  const rule = await prisma.emailRoutingRule.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, enabled: true },
  });
  if (!rule) return;

  await prisma.emailRoutingRule.update({
    where: { id },
    data: { enabled },
  });

  await audit({
    organizationId,
    actorUserId,
    action: enabled ? 'email_routing.enable' : 'email_routing.disable',
    resourceType: 'email_routing_rule',
    resourceId: id,
    diff: { before: { enabled: rule.enabled }, after: { enabled } },
  });
}

export async function deleteRule(
  organizationId: string,
  actorUserId: string,
  id: string,
): Promise<void> {
  const rule = await prisma.emailRoutingRule.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, pattern: true },
  });
  if (!rule) return;

  await prisma.emailRoutingRule.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'email_routing.delete',
    resourceType: 'email_routing_rule',
    resourceId: id,
    diff: { before: { pattern: rule.pattern } },
  });
}
