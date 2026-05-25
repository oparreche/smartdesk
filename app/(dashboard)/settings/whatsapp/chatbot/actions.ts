'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { encrypt } from '@/src/lib/crypto';
import { audit } from '@/src/services/audit/log';

const RequiredField = z.object({
  key: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(80),
  question: z.string().min(1).max(300),
  type: z.enum(['text', 'email', 'phone', 'cpf']).default('text'),
  required: z.boolean().default(true),
});

const SaveInput = z.object({
  connectionId: z.string().uuid(),
  enabled: z.boolean(),
  greeting: z.string().min(1).max(2000),
  systemPrompt: z.string().min(10).max(8000),
  requiredFields: z.array(RequiredField).max(20),
  escalationKeywords: z.array(z.string().min(1).max(60)).max(20),
  maxTurns: z.number().int().min(2).max(50),
  geminiApiKey: z.string().max(200).optional(),  // se vazio = mantém o existente; se "__clear__" = remove
  geminiModel: z.string().max(80).optional(),
});

export type SaveState = { ok: true } | { ok: false; error: string };

export async function saveChatbotConfigAction(
  _prev: SaveState | undefined,
  form: FormData,
): Promise<SaveState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');

  let requiredFields: unknown;
  let escalationKeywords: unknown;
  try {
    requiredFields = JSON.parse(String(form.get('requiredFields') ?? '[]'));
    escalationKeywords = JSON.parse(String(form.get('escalationKeywords') ?? '[]'));
  } catch {
    return { ok: false, error: 'JSON inválido nos campos required_fields ou escalation_keywords' };
  }

  const parsed = SaveInput.safeParse({
    connectionId: form.get('connectionId'),
    enabled: form.get('enabled') === 'on' || form.get('enabled') === 'true',
    greeting: form.get('greeting'),
    systemPrompt: form.get('systemPrompt'),
    requiredFields,
    escalationKeywords,
    maxTurns: Number(form.get('maxTurns') ?? 20),
    geminiApiKey: (form.get('geminiApiKey') as string | null) || undefined,
    geminiModel: (form.get('geminiModel') as string | null) || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  // Confere se a connection pertence à org
  const conn = await prisma.whatsappConnection.findFirst({
    where: { id: parsed.data.connectionId, organizationId: ctx.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!conn) return { ok: false, error: 'Conexão não encontrada' };

  // Trata API key: __clear__ remove, vazio mantém, valor novo encripta
  const apiKeyAction = parsed.data.geminiApiKey?.trim();
  let keyUpdate: { geminiApiKeyEnc: string | null; geminiApiKeyNonce: string | null } | null = null;
  if (apiKeyAction === '__clear__') {
    keyUpdate = { geminiApiKeyEnc: null, geminiApiKeyNonce: null };
  } else if (apiKeyAction && apiKeyAction.length > 5) {
    const s = encrypt(apiKeyAction);
    keyUpdate = { geminiApiKeyEnc: s.ciphertext, geminiApiKeyNonce: s.nonce };
  }

  const base = {
    enabled: parsed.data.enabled,
    greeting: parsed.data.greeting,
    systemPrompt: parsed.data.systemPrompt,
    requiredFields: parsed.data.requiredFields as unknown as Prisma.InputJsonValue,
    escalationKeywords: parsed.data.escalationKeywords as unknown as Prisma.InputJsonValue,
    maxTurns: parsed.data.maxTurns,
    geminiModel: parsed.data.geminiModel ?? null,
  };

  await prisma.chatbotConfig.upsert({
    where: { connectionId: conn.id },
    create: {
      organizationId: ctx.organizationId,
      connectionId: conn.id,
      ...base,
      ...(keyUpdate ?? { geminiApiKeyEnc: null, geminiApiKeyNonce: null }),
    },
    update: {
      ...base,
      ...(keyUpdate ?? {}),
    },
  });

  await audit({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'chatbot.config_saved',
    resourceType: 'chatbot_config',
    resourceId: conn.id,
    diff: { after: { enabled: base.enabled, fields: parsed.data.requiredFields.length } },
  });

  revalidatePath('/settings/whatsapp/chatbot');
  return { ok: true };
}
