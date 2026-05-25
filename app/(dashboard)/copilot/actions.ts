'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { prisma } from '@/src/lib/prisma';
import { runCopilotTurn, type Citation } from '@/src/services/copilot/run';

const TurnInput = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

export type TurnState =
  | { ok: true; assistantText: string; citations: Citation[]; conversationId: string }
  | { ok: false; error: string };

export async function askCopilotAction(
  _prev: TurnState | undefined,
  form: FormData,
): Promise<TurnState> {
  const ctx = await getOrgContext();
  const parsed = TurnInput.safeParse({
    conversationId: (form.get('conversationId') as string | null) || undefined,
    message: form.get('message'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Mensagem inválida' };
  }
  try {
    const r = await runCopilotTurn({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      conversationId: parsed.data.conversationId,
      message: parsed.data.message,
    });
    revalidatePath('/copilot');
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const TicketTurnInput = z.object({
  ticketCode: z.string().min(1).max(40),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

export async function askCopilotAboutTicketAction(
  _prev: TurnState | undefined,
  form: FormData,
): Promise<TurnState> {
  const ctx = await getOrgContext();
  const parsed = TicketTurnInput.safeParse({
    ticketCode: form.get('ticketCode'),
    conversationId: (form.get('conversationId') as string | null) || undefined,
    message: form.get('message'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Mensagem inválida' };
  }

  const ticket = await prisma.ticket.findFirst({
    where: { organizationId: ctx.organizationId, code: parsed.data.ticketCode, deletedAt: null },
    select: {
      id: true,
      code: true,
      subject: true,
      description: true,
      status: true,
      priority: true,
      createdAt: true,
      requester: { select: { name: true, email: true, phone: true } },
      assignee: { select: { name: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { type: true, bodyText: true, createdAt: true },
      },
    },
  });
  if (!ticket) return { ok: false, error: 'Ticket não encontrado' };

  const lastMessages = [...ticket.messages].reverse();
  const extraContext = [
    `Ticket ${ticket.code}: ${ticket.subject}`,
    `Status: ${ticket.status} · Prioridade: ${ticket.priority}`,
    `Solicitante: ${ticket.requester.name ?? '—'} <${ticket.requester.email ?? ticket.requester.phone ?? '—'}>`,
    ticket.assignee ? `Atendente: ${ticket.assignee.name}` : 'Sem atendente atribuído',
    '',
    ticket.description ? `Descrição inicial:\n${ticket.description.slice(0, 1500)}` : '',
    '',
    'Últimas mensagens:',
    ...lastMessages.map((m) => `[${m.type}] ${(m.bodyText ?? '').slice(0, 800)}`),
  ].filter(Boolean).join('\n');

  try {
    const r = await runCopilotTurn({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      conversationId: parsed.data.conversationId,
      ticketId: ticket.id,
      message: parsed.data.message,
      extraSystemContext: extraContext,
    });
    revalidatePath(`/tickets/${ticket.code}`);
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
