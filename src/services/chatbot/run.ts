import 'server-only';
import { Prisma, type ChatbotSessionState } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { complete } from '@/src/lib/gemini';
import { decrypt } from '@/src/lib/crypto';
import { sendWhatsappText } from '@/src/services/whatsapp/send-text';
import { findOrCreateRequester } from '@/src/services/requesters/find-or-create';
import { createTicket } from '@/src/services/tickets/create';
import { audit } from '@/src/services/audit/log';

const HISTORY_LIMIT = 30;

export type RequiredField = {
  key: string;
  label: string;
  question: string;
  type?: 'text' | 'email' | 'phone' | 'cpf';
  required?: boolean;
};

type SessionMessage = { role: 'user' | 'model'; text: string; at: string };

export type ChatbotTurnResult = {
  handled: boolean;       // se true, ingest.ts NÃO cria ticket nem persiste TicketMessage
  reply?: string;         // texto enviado ao usuário
  escalated?: boolean;
  ticketCode?: string;
};

/**
 * Processa uma mensagem inbound do WhatsApp através do chatbot configurado.
 * Retorna handled=false se chatbot não está habilitado pra essa conexão.
 */
export async function runChatbotTurn(input: {
  organizationId: string;
  connectionId: string;
  fromPhone: string;
  contactName?: string;
  text: string;
  waMessageId: string;
}): Promise<ChatbotTurnResult> {
  const cfg = await prisma.chatbotConfig.findUnique({
    where: { connectionId: input.connectionId },
  });
  if (!cfg || !cfg.enabled) {
    return { handled: false };
  }

  // Pega/cria sessão ativa pra esse phoneNumber
  const session = await getOrCreateActiveSession(input.organizationId, input.connectionId, input.fromPhone);

  // Append turn do usuário no histórico
  const history = readMessages(session.messages);
  history.push({ role: 'user', text: input.text, at: new Date().toISOString() });

  const requiredFields = readRequiredFields(cfg.requiredFields);
  const escalationKeywords = readKeywords(cfg.escalationKeywords);
  const collected = readCollected(session.collectedFields);

  // 1) Escalonamento por keyword (case-insensitive)
  const lower = input.text.toLowerCase();
  if (escalationKeywords.some((k) => lower.includes(k.toLowerCase()))) {
    return escalateAndRespond({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      sessionId: session.id,
      fromPhone: input.fromPhone,
      contactName: input.contactName,
      collected,
      history,
      requiredFields,
      reason: 'keyword',
    });
  }

  // 2) Se há um campo "em foco" (último que pediu), tenta interpretar a resposta como valor desse campo
  const focusKey = pickPendingField(requiredFields, collected, history);
  if (focusKey) {
    // Heurística simples: a resposta inteira é o valor (se passar validação).
    const valid = validateField(focusKey, input.text);
    if (valid) {
      collected[focusKey.key] = input.text.trim();
    }
  }

  // 3) Se ainda há campos pendentes, monta prompt pra LLM com instrução de coletar
  const stillMissing = requiredFields.filter((f) => f.required !== false && !collected[f.key]);

  // 4) Limite de turnos — força escalonamento
  const nextTurns = session.turns + 1;
  if (nextTurns >= cfg.maxTurns) {
    return escalateAndRespond({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      sessionId: session.id,
      fromPhone: input.fromPhone,
      contactName: input.contactName,
      collected,
      history,
      requiredFields,
      reason: 'max_turns',
    });
  }

  // 5) Chama LLM
  let aiReply: string;
  try {
    aiReply = await callBotLlm({
      cfg,
      history,
      collected,
      missing: stillMissing,
    });
  } catch (err) {
    logger.warn({ err, sessionId: session.id }, 'chatbot llm failed');
    // Fallback: escala
    return escalateAndRespond({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      sessionId: session.id,
      fromPhone: input.fromPhone,
      contactName: input.contactName,
      collected,
      history,
      requiredFields,
      reason: 'llm_error',
    });
  }

  // 6) Detecta sinal de escalonamento na resposta do modelo
  const wantsEscalation = /\[ESCALAR\]|\[ESCALATE\]/i.test(aiReply);
  const cleanedReply = aiReply.replace(/\[ESCALAR\]|\[ESCALATE\]/gi, '').trim();

  // Se todos os campos foram coletados, escalar pra abrir o ticket
  const allCollected = stillMissing.length === 0;

  if (wantsEscalation || allCollected) {
    // Envia a última fala do bot antes de criar o ticket (se houver texto útil)
    if (cleanedReply) {
      await sendWhatsappText(input.connectionId, input.fromPhone, cleanedReply);
      history.push({ role: 'model', text: cleanedReply, at: new Date().toISOString() });
    }
    return escalateAndRespond({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      sessionId: session.id,
      fromPhone: input.fromPhone,
      contactName: input.contactName,
      collected,
      history,
      requiredFields,
      reason: wantsEscalation ? 'bot_decision' : 'all_collected',
      skipReply: true,
    });
  }

  // 7) Resposta normal
  const sendResult = await sendWhatsappText(input.connectionId, input.fromPhone, cleanedReply);
  if ('error' in sendResult) {
    logger.warn({ err: sendResult.error, sessionId: session.id }, 'chatbot send failed');
    // Mesmo se falhou enviar, persistimos o turn pra debug.
  }
  history.push({ role: 'model', text: cleanedReply, at: new Date().toISOString() });

  await prisma.chatbotSession.update({
    where: { id: session.id },
    data: {
      messages: trimHistory(history) as unknown as Prisma.InputJsonValue,
      collectedFields: Object.keys(collected).length
        ? (collected as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      turns: nextTurns,
      lastMessageAt: new Date(),
    },
  });

  return { handled: true, reply: cleanedReply };
}

async function getOrCreateActiveSession(
  organizationId: string,
  connectionId: string,
  fromPhone: string,
) {
  const found = await prisma.chatbotSession.findFirst({
    where: { connectionId, fromPhone, state: 'active' },
  });
  if (found) return found;
  return prisma.chatbotSession.create({
    data: {
      organizationId,
      connectionId,
      fromPhone,
      messages: [] as unknown as Prisma.InputJsonValue,
      state: 'active',
    },
  });
}

async function callBotLlm(input: {
  cfg: {
    systemPrompt: string;
    greeting: string;
    geminiApiKeyEnc: string | null;
    geminiApiKeyNonce: string | null;
    geminiModel: string | null;
  };
  history: SessionMessage[];
  collected: Record<string, string>;
  missing: RequiredField[];
}): Promise<string> {
  const tenantKey =
    input.cfg.geminiApiKeyEnc && input.cfg.geminiApiKeyNonce
      ? decrypt({ ciphertext: input.cfg.geminiApiKeyEnc, nonce: input.cfg.geminiApiKeyNonce })
      : undefined;

  const collectedLine =
    Object.keys(input.collected).length === 0
      ? 'Ainda não tem informação coletada.'
      : 'Informações já coletadas:\n' +
        Object.entries(input.collected).map(([k, v]) => `- ${k}: ${v}`).join('\n');

  const missingLine =
    input.missing.length === 0
      ? 'Todos os campos obrigatórios já foram coletados — você pode escalar pra atendente humano usando [ESCALAR].'
      : 'Você ainda precisa coletar os seguintes campos do usuário, um por vez:\n' +
        input.missing.map((f) => `- ${f.key} (${f.label}): "${f.question}"`).join('\n');

  const system = [
    input.cfg.systemPrompt.trim(),
    '',
    '---',
    'REGRAS OPERACIONAIS:',
    '- Responda sempre em português brasileiro, tom acolhedor e direto.',
    '- Sua principal função é ajudar dentro do escopo descrito acima.',
    '- Se o usuário pedir atendente humano ou se o assunto for fora do seu escopo, responda com a frase de transição + a tag [ESCALAR] no fim.',
    `- ${collectedLine}`,
    `- ${missingLine}`,
    '- Quando faltar campos obrigatórios, pergunte um por vez na ordem listada.',
    '- Não invente informações sobre tickets, status, prazos ou pedidos.',
    '- Mensagens curtas (até 3 linhas). Use emoji com moderação.',
  ].join('\n');

  return complete({
    system,
    messages: input.history.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      content: m.text,
    })),
    apiKey: tenantKey,
    model: input.cfg.geminiModel ?? undefined,
    temperature: 0.5,
    maxTokens: 400,
  });
}

async function escalateAndRespond(input: {
  organizationId: string;
  connectionId: string;
  sessionId: string;
  fromPhone: string;
  contactName?: string;
  collected: Record<string, string>;
  history: SessionMessage[];
  requiredFields: RequiredField[];
  reason: 'keyword' | 'max_turns' | 'llm_error' | 'bot_decision' | 'all_collected';
  /** Pula a mensagem final pro user (caso já tenhamos enviado). */
  skipReply?: boolean;
}): Promise<ChatbotTurnResult> {
  // Cria requester (ou pega existente) com nome/phone + campos extras se coletados
  const requesterEmail = input.collected.email;
  const requesterName = input.contactName ?? input.collected.nome ?? input.collected.name;
  const requester = await findOrCreateRequester(input.organizationId, {
    phone: input.fromPhone,
    name: requesterName ?? null,
    email: requesterEmail ?? null,
  });

  // Cria ticket — assunto e descrição vêm do histórico do chatbot
  const firstUserMsg = input.history.find((m) => m.role === 'user')?.text ?? '(sem mensagem)';
  const subject = firstUserMsg.slice(0, 80) || 'Atendimento WhatsApp';
  const description = [
    `Bot escalou (motivo: ${input.reason}).`,
    '',
    'Campos coletados:',
    ...Object.entries(input.collected).map(([k, v]) => `- ${k}: ${v}`),
    '',
    'Histórico:',
    ...input.history.map((m) => `[${m.role}] ${m.text}`),
  ].join('\n');

  const ticket = await createTicket(input.organizationId, null, {
    subject,
    description,
    origin: 'whatsapp',
    requester: {
      phone: input.fromPhone,
      name: requesterName ?? null,
      email: requesterEmail ?? null,
    },
    customFields: input.collected as Record<string, unknown>,
  });

  // Marca sessão como escalada
  await prisma.chatbotSession.update({
    where: { id: input.sessionId },
    data: {
      state: 'escalated' as ChatbotSessionState,
      collectedFields: Object.keys(input.collected).length
        ? (input.collected as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      messages: trimHistory(input.history) as unknown as Prisma.InputJsonValue,
      ticketId: ticket.id,
      completedAt: new Date(),
      lastMessageAt: new Date(),
    },
  });

  await audit({
    organizationId: input.organizationId,
    actorUserId: null,
    action: 'chatbot.escalated',
    resourceType: 'ticket',
    resourceId: ticket.id,
    diff: { after: { reason: input.reason, requesterId: requester.id, ticketCode: ticket.code } },
  });

  // Mensagem final pro usuário se ainda não enviamos
  if (!input.skipReply) {
    const closing = `Obrigado! Já registrei sua solicitação — seu atendimento é o *${ticket.code}*. Um atendente vai assumir em instantes.`;
    await sendWhatsappText(input.connectionId, input.fromPhone, closing);
  }

  return { handled: true, escalated: true, ticketCode: ticket.code };
}

function pickPendingField(
  fields: RequiredField[],
  collected: Record<string, string>,
  history: SessionMessage[],
): RequiredField | null {
  // Encontra o último turno do bot e tenta detectar se ele perguntou sobre algum campo.
  const lastModel = [...history].reverse().find((m) => m.role === 'model')?.text?.toLowerCase() ?? '';
  for (const f of fields) {
    if (collected[f.key]) continue;
    if (lastModel.includes(f.label.toLowerCase()) || lastModel.includes(f.key.toLowerCase())) {
      return f;
    }
  }
  // Se não detectou, escolhe o primeiro pendente
  return fields.find((f) => (f.required !== false) && !collected[f.key]) ?? null;
}

function validateField(field: RequiredField, value: string): boolean {
  const v = value.trim();
  if (v.length < 2) return false;
  if (field.type === 'email') return /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v);
  if (field.type === 'phone') return /\d{8,}/.test(v.replace(/\D/g, ''));
  if (field.type === 'cpf') {
    const digits = v.replace(/\D/g, '');
    return digits.length === 11;
  }
  return true;
}

function readMessages(raw: unknown): SessionMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is SessionMessage =>
    typeof m === 'object' && m !== null &&
    (m as { role: string }).role !== undefined &&
    typeof (m as { text: string }).text === 'string',
  );
}

function readRequiredFields(raw: unknown): RequiredField[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is RequiredField =>
    typeof f === 'object' && f !== null &&
    typeof (f as { key: string }).key === 'string',
  );
}

function readKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === 'string');
}

function readCollected(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function trimHistory(history: SessionMessage[]): SessionMessage[] {
  return history.slice(-HISTORY_LIMIT);
}
