'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { createTicket } from '@/src/services/tickets/create';

const Input = z.object({
  subject: z.string().min(1, 'Assunto obrigatório').max(200),
  description: z.string().max(50_000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent', 'critical']).default('normal'),
  queueId: z.string().uuid().optional().or(z.literal('')),
  requesterEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  requesterName: z.string().max(120).optional(),
  requesterDocument: z.string().max(30).optional(),
  requesterPhone: z.string().max(30).optional(),
});

export type CreateTicketState = { ok: true; code: string } | { ok: false; error: string };

export async function createTicketAction(
  _prev: CreateTicketState | undefined,
  formData: FormData,
): Promise<CreateTicketState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:create');

  const parsed = Input.safeParse({
    subject: formData.get('subject'),
    description: formData.get('description') || undefined,
    priority: formData.get('priority') || 'normal',
    queueId: formData.get('queueId') || '',
    requesterEmail: formData.get('requesterEmail') || '',
    requesterName: formData.get('requesterName') || undefined,
    requesterDocument: formData.get('requesterDocument') || undefined,
    requesterPhone: formData.get('requesterPhone') || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  if (!parsed.data.requesterEmail && !parsed.data.requesterDocument && !parsed.data.requesterName) {
    return { ok: false, error: 'Informe pelo menos nome, email ou documento do solicitante.' };
  }

  let created: { code: string };
  try {
    created = await createTicket(ctx.organizationId, ctx.userId, {
      subject: parsed.data.subject,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority,
      queueId: parsed.data.queueId || null,
      origin: 'manual',
      requester: {
        email: parsed.data.requesterEmail || null,
        name: parsed.data.requesterName || null,
        document: parsed.data.requesterDocument || null,
        phone: parsed.data.requesterPhone || null,
      },
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  revalidatePath('/tickets');
  redirect(`/tickets/${created.code}`);
}
