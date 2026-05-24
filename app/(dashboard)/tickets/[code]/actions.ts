'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { addTicketMessage } from '@/src/services/tickets/messages';
import { updateTicket, InvalidStatusTransitionError } from '@/src/services/tickets/update';
import { prisma } from '@/src/lib/prisma';

async function ticketByCodeOr404(organizationId: string, code: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { organizationId, code, deletedAt: null },
    select: { id: true, code: true },
  });
  if (!ticket) throw new Error('Ticket não encontrado');
  return ticket;
}

const AttachmentSchema = z.object({
  storageKey: z.string().min(1).max(500),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(200),
  sizeBytes: z.coerce.number().int().min(1).max(25 * 1024 * 1024),
});

const MessageInput = z.object({
  code: z.string(),
  type: z.enum(['public_reply', 'internal_note']),
  body: z.string().min(1).max(50_000),
  channel: z.enum(['email', 'whatsapp']).optional(),
  attachmentsJson: z.string().optional(),
});

export type MessageState = { ok: true } | { ok: false; error: string };

export async function addMessageAction(
  _prev: MessageState | undefined,
  formData: FormData,
): Promise<MessageState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:reply');

  const parsed = MessageInput.safeParse({
    code: formData.get('code'),
    type: formData.get('type'),
    body: formData.get('body'),
    channel: formData.get('channel') || undefined,
    attachmentsJson: formData.get('attachmentsJson') || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Mensagem inválida.' };

  let attachments: z.infer<typeof AttachmentSchema>[] = [];
  if (parsed.data.attachmentsJson) {
    try {
      const raw = JSON.parse(parsed.data.attachmentsJson);
      attachments = z.array(AttachmentSchema).max(10).parse(raw);
    } catch {
      return { ok: false, error: 'Anexos inválidos.' };
    }
  }

  try {
    const ticket = await ticketByCodeOr404(ctx.organizationId, parsed.data.code);
    await addTicketMessage(ctx.organizationId, ctx.userId, ticket.id, {
      type: parsed.data.type,
      body: parsed.data.body,
      channel: parsed.data.channel,
      attachments,
    });
    revalidatePath(`/tickets/${parsed.data.code}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const StatusInput = z.object({
  code: z.string(),
  status: z.enum([
    'new', 'open', 'in_progress', 'pending_customer', 'pending_third_party', 'resolved', 'closed', 'cancelled',
  ]),
});

export async function changeStatusAction(formData: FormData) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:update');

  const parsed = StatusInput.safeParse({
    code: formData.get('code'),
    status: formData.get('status'),
  });
  if (!parsed.success) return;

  const ticket = await ticketByCodeOr404(ctx.organizationId, parsed.data.code);
  try {
    await updateTicket(ctx.organizationId, ctx.userId, ticket.id, { status: parsed.data.status });
  } catch (err) {
    if (err instanceof InvalidStatusTransitionError) return;
    throw err;
  }
  revalidatePath(`/tickets/${parsed.data.code}`);
}

const PriorityInput = z.object({
  code: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'urgent', 'critical']),
});

export async function changePriorityAction(formData: FormData) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:update');

  const parsed = PriorityInput.safeParse({
    code: formData.get('code'),
    priority: formData.get('priority'),
  });
  if (!parsed.success) return;

  const ticket = await ticketByCodeOr404(ctx.organizationId, parsed.data.code);
  await updateTicket(ctx.organizationId, ctx.userId, ticket.id, { priority: parsed.data.priority });
  revalidatePath(`/tickets/${parsed.data.code}`);
}

const AssigneeInput = z.object({
  code: z.string(),
  assigneeId: z.string().uuid().or(z.literal('')),
});

export async function changeAssigneeAction(formData: FormData) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:assign');

  const parsed = AssigneeInput.safeParse({
    code: formData.get('code'),
    assigneeId: formData.get('assigneeId') ?? '',
  });
  if (!parsed.success) return;

  const ticket = await ticketByCodeOr404(ctx.organizationId, parsed.data.code);
  await updateTicket(ctx.organizationId, ctx.userId, ticket.id, {
    assigneeId: parsed.data.assigneeId || null,
  });
  revalidatePath(`/tickets/${parsed.data.code}`);
}

const QueueInput = z.object({
  code: z.string(),
  queueId: z.string().uuid().or(z.literal('')),
});

export async function changeQueueAction(formData: FormData) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:update');

  const parsed = QueueInput.safeParse({
    code: formData.get('code'),
    queueId: formData.get('queueId') ?? '',
  });
  if (!parsed.success) return;

  const ticket = await ticketByCodeOr404(ctx.organizationId, parsed.data.code);
  await updateTicket(ctx.organizationId, ctx.userId, ticket.id, {
    queueId: parsed.data.queueId || null,
  });
  revalidatePath(`/tickets/${parsed.data.code}`);
}
