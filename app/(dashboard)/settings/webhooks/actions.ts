'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import {
  createEndpoint,
  toggleEndpoint,
  deleteEndpoint,
  WEBHOOK_EVENTS,
  type WebhookEvent,
} from '@/src/services/webhooks';

const CreateInput = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(500),
  events: z.array(z.string()).min(1),
});

export type WebhookState =
  | { ok: true; id: string; secret: string }
  | { ok: false; error: string }
  | undefined;

export async function createWebhookAction(
  _prev: WebhookState,
  form: FormData,
): Promise<WebhookState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');

  const events = form.getAll('events').map(String);
  const parsed = CreateInput.safeParse({
    name: form.get('name'),
    url: form.get('url'),
    events,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Inválido' };

  try {
    const validEvents = parsed.data.events.filter((e) =>
      (WEBHOOK_EVENTS as string[]).includes(e),
    ) as WebhookEvent[];
    const r = await createEndpoint(ctx.organizationId, ctx.userId, {
      name: parsed.data.name,
      url: parsed.data.url,
      events: validEvents,
    });
    revalidatePath('/settings/webhooks');
    return { ok: true, id: r.id, secret: r.secret };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function toggleWebhookAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');
  const id = String(form.get('id') ?? '');
  const enabled = form.get('enabled') === 'true';
  if (!id) return;
  try {
    await toggleEndpoint(ctx.organizationId, ctx.userId, id, enabled);
  } catch {
    /* noop */
  }
  revalidatePath('/settings/webhooks');
}

export async function deleteWebhookAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');
  const id = String(form.get('id') ?? '');
  if (!id) return;
  try {
    await deleteEndpoint(ctx.organizationId, ctx.userId, id);
  } catch {
    /* noop */
  }
  revalidatePath('/settings/webhooks');
}
