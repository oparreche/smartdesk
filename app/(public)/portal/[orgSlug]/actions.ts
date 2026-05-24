'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/src/lib/prisma';
import {
  clearPortalSession,
  getPortalSession,
  requestMagicLink,
} from '@/src/services/portal/auth';
import { createTicket } from '@/src/services/tickets/create';

const MagicLinkInput = z.object({
  organizationSlug: z.string().min(1).max(60),
  email: z.string().email().max(200),
});

export type MagicLinkState =
  | { ok: true; sent: true }
  | { ok: false; error: string }
  | undefined;

export async function requestMagicLinkAction(
  _prev: MagicLinkState,
  form: FormData,
): Promise<MagicLinkState> {
  const parsed = MagicLinkInput.safeParse({
    organizationSlug: form.get('organizationSlug'),
    email: form.get('email'),
  });
  if (!parsed.success) return { ok: false, error: 'Email inválido.' };

  await requestMagicLink(parsed.data);
  return { ok: true, sent: true };
}

export async function portalLogoutAction(): Promise<void> {
  await clearPortalSession();
  redirect('/portal');
}

const NewTicketInput = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().max(20_000).optional(),
});

export type NewTicketState =
  | { ok: true; code: string }
  | { ok: false; error: string }
  | undefined;

export async function portalCreateTicketAction(
  _prev: NewTicketState,
  form: FormData,
): Promise<NewTicketState> {
  const session = await getPortalSession();
  if (!session) return { ok: false, error: 'sessão expirada' };

  const parsed = NewTicketInput.safeParse({
    subject: form.get('subject'),
    description: form.get('description') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Preencha o assunto (mín. 3 caracteres).' };
  }

  const requester = await prisma.requester.findFirst({
    where: { id: session.requesterId, organizationId: session.organizationId },
    select: { email: true, name: true, document: true, phone: true },
  });
  if (!requester || !requester.email) return { ok: false, error: 'requester_invalid' };

  const ticket = await createTicket(session.organizationId, null, {
    subject: parsed.data.subject,
    description: parsed.data.description ?? null,
    origin: 'form',
    priority: 'normal',
    status: 'new',
    requester: {
      email: requester.email,
      name: requester.name,
      document: requester.document,
      phone: requester.phone,
    },
  });

  revalidatePath(`/portal/${session.organizationSlug}`);
  return { ok: true, code: ticket.code };
}
