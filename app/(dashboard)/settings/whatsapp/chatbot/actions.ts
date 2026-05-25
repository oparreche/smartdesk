'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { encrypt, decrypt } from '@/src/lib/crypto';
import { audit } from '@/src/services/audit/log';
import { complete } from '@/src/lib/gemini';

const RequiredField = z.object({
  key: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(80),
  question: z.string().min(1).max(300),
  type: z.enum(['text', 'email', 'phone', 'cpf']).default('text'),
  required: z.boolean().default(true),
});

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const SaveInput = z.object({
  connectionId: z.string().uuid(),
  mode: z.enum(['off', 'scripted', 'llm']),
  greeting: z.string().min(1).max(2000),
  systemPrompt: z.string().min(10).max(8000),
  requiredFields: z.array(RequiredField).max(20),
  escalationKeywords: z.array(z.string().min(1).max(60)).max(20),
  maxTurns: z.number().int().min(2).max(50),
  outOfHoursMessage: z.string().max(2000).optional(),
  businessHoursStart: HHMM.optional(),
  businessHoursEnd: HHMM.optional(),
  businessTimezone: z.string().max(60).optional(),
  geminiApiKey: z.string().max(200).optional(),  // vazio mantém, "__clear__" remove, valor encripta
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
    mode: form.get('mode'),
    greeting: form.get('greeting'),
    systemPrompt: form.get('systemPrompt'),
    requiredFields,
    escalationKeywords,
    maxTurns: Number(form.get('maxTurns') ?? 20),
    outOfHoursMessage: (form.get('outOfHoursMessage') as string | null) || undefined,
    businessHoursStart: (form.get('businessHoursStart') as string | null) || undefined,
    businessHoursEnd: (form.get('businessHoursEnd') as string | null) || undefined,
    businessTimezone: (form.get('businessTimezone') as string | null) || undefined,
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
    mode: parsed.data.mode,
    greeting: parsed.data.greeting,
    systemPrompt: parsed.data.systemPrompt,
    requiredFields: parsed.data.requiredFields as unknown as Prisma.InputJsonValue,
    escalationKeywords: parsed.data.escalationKeywords as unknown as Prisma.InputJsonValue,
    maxTurns: parsed.data.maxTurns,
    outOfHoursMessage: parsed.data.outOfHoursMessage ?? null,
    businessHoursStart: parsed.data.businessHoursStart ?? null,
    businessHoursEnd: parsed.data.businessHoursEnd ?? null,
    businessTimezone: parsed.data.businessTimezone ?? 'America/Sao_Paulo',
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
    diff: { after: { mode: base.mode, fields: parsed.data.requiredFields.length } },
  });

  revalidatePath('/settings/whatsapp/chatbot');
  return { ok: true };
}

const ImproveInput = z.object({
  connectionId: z.string().uuid(),
  systemPrompt: z.string().min(10).max(8000),
});

export type ImprovePromptState =
  | { ok: true; improved: string }
  | { ok: false; error: string };

/**
 * Reescreve o system prompt do chatbot usando Gemini com técnicas de prompt engineering.
 * Usa a chave do tenant se configurada, senão a global.
 */
export async function improvePromptAction(
  _prev: ImprovePromptState | undefined,
  form: FormData,
): Promise<ImprovePromptState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');

  const parsed = ImproveInput.safeParse({
    connectionId: form.get('connectionId'),
    systemPrompt: form.get('systemPrompt'),
  });
  if (!parsed.success) {
    return { ok: false, error: 'Prompt inválido (mín. 10 chars).' };
  }

  // Busca chave do tenant se configurada
  const cfg = await prisma.chatbotConfig.findFirst({
    where: { connectionId: parsed.data.connectionId, organizationId: ctx.organizationId },
    select: { geminiApiKeyEnc: true, geminiApiKeyNonce: true, geminiModel: true },
  });
  const tenantKey =
    cfg?.geminiApiKeyEnc && cfg.geminiApiKeyNonce
      ? decrypt({ ciphertext: cfg.geminiApiKeyEnc, nonce: cfg.geminiApiKeyNonce })
      : undefined;

  const meta = `Você é especialista em prompt engineering para chatbots de atendimento ao cliente em WhatsApp.

Reescreva o prompt do sistema abaixo aplicando:
1. Definição clara de papel + tom + público
2. Escopo de conhecimento (o que SABE / o que NÃO SABE)
3. Regras de comportamento (sem inventar dados, ser conciso, usar PT-BR)
4. Sinal explícito para escalonamento (tag [ESCALAR] quando fora do escopo)
5. Mensagens curtas (max 3 linhas), uso comedido de emojis
6. Mantém qualquer dado específico do negócio que o prompt original já cita

Devolva APENAS o novo prompt, sem comentários, sem markdown, sem aspas envolvendo, pronto pra colar.

PROMPT ATUAL:
"""
${parsed.data.systemPrompt}
"""`;

  try {
    const improved = await complete({
      messages: [{ role: 'user', content: meta }],
      apiKey: tenantKey,
      model: cfg?.geminiModel ?? undefined,
      temperature: 0.3,
      maxTokens: 2000,
    });
    return { ok: true, improved: improved.trim().slice(0, 8000) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
