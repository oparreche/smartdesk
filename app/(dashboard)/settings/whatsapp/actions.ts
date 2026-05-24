'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { createConnection, disconnectConnection, updateConnection } from '@/src/services/whatsapp/setup';

const CreateInput = z.object({
  displayPhoneNumber: z.string().min(3).max(40),
  phoneNumberId: z.string().min(3).max(64),
  businessAccountId: z.string().min(3).max(64),
  accessToken: z.string().min(20).max(2000),
  appSecret: z.string().max(200).optional(),
});

export type CreateState =
  | { ok: true; webhookUrl: string; verifyToken: string }
  | { ok: false; error: string };

export async function createWhatsappAction(
  _prev: CreateState | undefined,
  form: FormData,
): Promise<CreateState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');

  const parsed = CreateInput.safeParse({
    displayPhoneNumber: form.get('displayPhoneNumber'),
    phoneNumberId: form.get('phoneNumberId'),
    businessAccountId: form.get('businessAccountId'),
    accessToken: form.get('accessToken'),
    appSecret: form.get('appSecret') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  try {
    const r = await createConnection({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      displayPhoneNumber: parsed.data.displayPhoneNumber,
      phoneNumberId: parsed.data.phoneNumberId,
      businessAccountId: parsed.data.businessAccountId,
      accessToken: parsed.data.accessToken,
      appSecret: parsed.data.appSecret,
    });
    revalidatePath('/settings/whatsapp');
    const appUrl = process.env.APP_URL ?? '';
    return {
      ok: true,
      webhookUrl: `${appUrl}/api/webhooks/whatsapp/${r.id}`,
      verifyToken: r.webhookVerifyToken,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const UpdateInput = z.object({
  id: z.string().uuid(),
  accessToken: z.string().min(0).max(2000).optional(),
  appSecret: z.string().min(0).max(200).optional(),
});

export async function updateWhatsappAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');

  const parsed = UpdateInput.parse({
    id: form.get('id'),
    accessToken: form.get('accessToken') || undefined,
    appSecret: form.get('appSecret') || undefined,
  });

  await updateConnection(ctx.organizationId, ctx.userId, parsed.id, {
    accessToken: parsed.accessToken,
    appSecret: parsed.appSecret,
  });
  revalidatePath('/settings/whatsapp');
}

const DisconnectInput = z.object({ id: z.string().uuid() });

export async function disconnectWhatsappAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');
  const parsed = DisconnectInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return;
  await disconnectConnection(ctx.organizationId, ctx.userId, parsed.data.id);
  revalidatePath('/settings/whatsapp');
}
