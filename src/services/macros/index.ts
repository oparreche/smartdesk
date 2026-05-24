import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';
import { renderTemplate } from '@/src/services/integrations/template';
import { ActionSchema, type Action } from '@/src/services/rules/schema';
import { z } from 'zod';

const NAME_MAX = 120;
const SHORTCUT_MAX = 40;
const BODY_MAX = 20_000;
const PER_ORG_LIMIT = 200;

const MacroActionsSchema = z.array(ActionSchema).max(10);

export type MacroSummary = {
  id: string;
  name: string;
  shortcut: string | null;
  body: string;
  actions: Action[];
  enabled: boolean;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export async function listMacros(
  organizationId: string,
  onlyEnabled = false,
): Promise<MacroSummary[]> {
  const rows = await prisma.macro.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(onlyEnabled ? { enabled: true } : {}),
    },
    orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      shortcut: true,
      body: true,
      actions: true,
      enabled: true,
      usageCount: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return rows.map((r) => ({
    ...r,
    actions: parseActions(r.actions),
  }));
}

function parseActions(raw: unknown): Action[] {
  const r = MacroActionsSchema.safeParse(raw);
  return r.success ? r.data : [];
}

export type CreateMacroInput = {
  name: string;
  shortcut?: string | null;
  body: string;
  actions?: Action[];
  enabled?: boolean;
};

export async function createMacro(
  organizationId: string,
  actorUserId: string,
  input: CreateMacroInput,
): Promise<{ id: string }> {
  const name = input.name.trim().slice(0, NAME_MAX);
  if (!name) throw new Error('Nome obrigatório');
  const body = input.body.slice(0, BODY_MAX);
  if (!body.trim()) throw new Error('Corpo obrigatório');
  const shortcut = input.shortcut?.trim().slice(0, SHORTCUT_MAX) || null;
  const actions = MacroActionsSchema.parse(input.actions ?? []);

  const total = await prisma.macro.count({
    where: { organizationId, deletedAt: null },
  });
  if (total >= PER_ORG_LIMIT) throw new Error(`Limite de ${PER_ORG_LIMIT} macros atingido`);

  if (shortcut) {
    const dup = await prisma.macro.findFirst({
      where: { organizationId, shortcut, deletedAt: null },
      select: { id: true },
    });
    if (dup) throw new Error(`Atalho ${shortcut} já em uso`);
  }

  const created = await prisma.macro.create({
    data: {
      organizationId,
      name,
      shortcut,
      body,
      actions: actions as unknown as object,
      enabled: input.enabled ?? true,
      createdById: actorUserId,
    },
    select: { id: true },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'macro.create',
    resourceType: 'macro',
    resourceId: created.id,
    diff: { after: { name, shortcut, hasActions: actions.length > 0 } },
  });

  return created;
}

export async function updateMacro(
  organizationId: string,
  actorUserId: string,
  id: string,
  input: Partial<CreateMacroInput>,
): Promise<void> {
  const m = await prisma.macro.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!m) return;

  const data: {
    name?: string;
    shortcut?: string | null;
    body?: string;
    enabled?: boolean;
    actions?: object;
  } = {};
  if (input.name !== undefined) data.name = input.name.trim().slice(0, NAME_MAX);
  if (input.shortcut !== undefined)
    data.shortcut = input.shortcut?.trim().slice(0, SHORTCUT_MAX) || null;
  if (input.body !== undefined) data.body = input.body.slice(0, BODY_MAX);
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.actions !== undefined) {
    data.actions = MacroActionsSchema.parse(input.actions) as unknown as object;
  }

  await prisma.macro.update({ where: { id }, data });

  await audit({
    organizationId,
    actorUserId,
    action: 'macro.update',
    resourceType: 'macro',
    resourceId: id,
    diff: { after: { fields: Object.keys(data) } },
  });
}

export async function deleteMacro(
  organizationId: string,
  actorUserId: string,
  id: string,
): Promise<void> {
  const m = await prisma.macro.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!m) return;
  await prisma.macro.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await audit({
    organizationId,
    actorUserId,
    action: 'macro.delete',
    resourceType: 'macro',
    resourceId: id,
    diff: { before: { name: m.name } },
  });
}

/**
 * Renderiza o body da macro com {{vars}} preenchidas a partir do contexto do ticket.
 */
export type MacroRenderContext = {
  ticket: {
    code: string;
    subject: string;
    status: string;
    priority: string;
    requester: { name: string | null; email: string | null };
  };
  agent: { name: string; email: string };
  org: { name: string };
};

export function renderMacroBody(body: string, ctx: MacroRenderContext): string {
  return renderTemplate(body, ctx as unknown as Record<string, unknown>);
}

/**
 * Incrementa contador de uso (best-effort, não bloqueia).
 */
export async function bumpUsage(macroId: string): Promise<void> {
  await prisma.macro
    .update({
      where: { id: macroId },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    })
    .catch(() => {});
}

/**
 * Aplica as ações da macro ao ticket (mudar status, tag, fila, etc.).
 * Reusa o executor de regras.
 */
export async function applyMacroActions(
  organizationId: string,
  actorUserId: string,
  ticketId: string,
  actions: Action[],
): Promise<{ applied: number; errors: string[] }> {
  if (actions.length === 0) return { applied: 0, errors: [] };

  const { executeAction } = await import('@/src/services/rules/actions');
  let applied = 0;
  const errors: string[] = [];
  for (const action of actions) {
    const r = await executeAction(action, {
      organizationId,
      ticketId,
      ruleId: `macro:${actorUserId}`,
      ruleName: 'macro',
      ctx: {},
    });
    if (r.ok) applied++;
    else errors.push(r.error);
  }
  return { applied, errors };
}
