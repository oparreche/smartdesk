'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import {
  createTemplate,
  deleteTemplate,
  syncTemplate,
  WaTemplateError,
  type TemplateComponent,
} from '@/src/services/whatsapp/templates';
import { sendTemplate } from '@/src/services/whatsapp/send-template';

const CreateInput = z.object({
  connectionId: z.string().uuid(),
  name: z.string().min(2).max(64),
  language: z.string().min(2).max(20),
  category: z.enum(['marketing', 'utility', 'authentication']),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).optional(),
  headerText: z.string().max(60).optional(),
});

export type CreateTemplateState =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createTemplateAction(
  _prev: CreateTemplateState | undefined,
  form: FormData,
): Promise<CreateTemplateState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');

  const parsed = CreateInput.safeParse({
    connectionId: form.get('connectionId'),
    name: form.get('name'),
    language: form.get('language'),
    category: form.get('category'),
    bodyText: form.get('bodyText'),
    footerText: form.get('footerText') || undefined,
    headerText: form.get('headerText') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const components: TemplateComponent[] = [];
  if (parsed.data.headerText) {
    components.push({ type: 'HEADER', format: 'TEXT', text: parsed.data.headerText });
  }
  components.push({ type: 'BODY', text: parsed.data.bodyText });
  if (parsed.data.footerText) {
    components.push({ type: 'FOOTER', text: parsed.data.footerText });
  }

  // Detecta variáveis {{1}}, {{2}} no body pra montar example automaticamente
  const varCount = (parsed.data.bodyText.match(/{{\s*\d+\s*}}/g) || []).length;
  if (varCount > 0) {
    const body = components.find((c) => c.type === 'BODY');
    if (body && body.type === 'BODY') {
      body.example = {
        body_text: [Array.from({ length: varCount }, (_, i) => `exemplo ${i + 1}`)],
      };
    }
  }

  try {
    const r = await createTemplate({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      connectionId: parsed.data.connectionId,
      name: parsed.data.name,
      language: parsed.data.language,
      category: parsed.data.category,
      components,
    });
    revalidatePath('/settings/whatsapp/templates');
    return { ok: true, id: r.id };
  } catch (err) {
    if (err instanceof WaTemplateError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: (err as Error).message };
  }
}

const IdInput = z.object({ id: z.string().uuid() });

export async function syncTemplateAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');
  const parsed = IdInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return;
  await syncTemplate(ctx.organizationId, parsed.data.id);
  revalidatePath('/settings/whatsapp/templates');
}

export async function deleteTemplateAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');
  const parsed = IdInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return;
  await deleteTemplate(ctx.organizationId, ctx.userId, parsed.data.id);
  revalidatePath('/settings/whatsapp/templates');
}

const SendInput = z.object({
  templateId: z.string().uuid(),
  recipientPhone: z.string().min(8).max(40),
  recipientName: z.string().max(200).optional(),
  variables: z.record(z.string(), z.string().max(2000)).optional(),
});

export type SendTemplateState =
  | { ok: true; waMessageId: string }
  | { ok: false; error: string };

export async function sendTemplateAction(
  _prev: SendTemplateState | undefined,
  form: FormData,
): Promise<SendTemplateState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');

  // variables vêm como var_1, var_2 etc no FormData
  const variables: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith('var_') && typeof v === 'string' && v.length > 0) {
      variables[k.slice(4)] = v;
    }
  }

  const parsed = SendInput.safeParse({
    templateId: form.get('templateId'),
    recipientPhone: form.get('recipientPhone'),
    recipientName: form.get('recipientName') || undefined,
    variables: Object.keys(variables).length > 0 ? variables : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  try {
    const r = await sendTemplate({
      organizationId: ctx.organizationId,
      templateId: parsed.data.templateId,
      recipientPhone: parsed.data.recipientPhone,
      recipientName: parsed.data.recipientName,
      variables: parsed.data.variables,
      sentByUserId: ctx.userId,
    });
    revalidatePath('/settings/whatsapp/templates');
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, waMessageId: r.waMessageId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
