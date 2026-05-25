import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { complete } from '@/src/lib/gemini';
import { searchKnowledge, type SearchHit } from '@/src/services/knowledge/search';

export type Citation = {
  chunkId: string;
  sourceId: string;
  refLabel: string | null;
  refUrl: string | null;
  score: number;
};

export type CopilotTurnResult = {
  assistantText: string;
  citations: Citation[];
  conversationId: string;
};

const DEFAULT_SYSTEM_PROMPT = `Você é o **Copilot interno do SmartDesk**, assistente do time de atendimento. Sua função é responder dúvidas dos atendentes baseado em documentos, artigos de knowledge base e tickets passados da organização.

Regras:
- Responda sempre em português brasileiro.
- Use APENAS o conteúdo do "Contexto" abaixo pra fundamentar respostas. Não invente.
- Se o contexto não tiver a resposta, diga claramente "Não encontrei isso nas fontes indexadas" e sugira buscar com outras palavras.
- Cite as fontes inline usando [n] (n = índice da fonte). Exemplo: "A política de devolução prevê 7 dias [1]."
- Tom direto e prático: agentes precisam de respostas rápidas, não de papo.
- Quando ajudar a redigir resposta pro cliente, mantenha cordialidade + linguagem do cliente final.`;

export async function runCopilotTurn(input: {
  organizationId: string;
  userId: string;
  conversationId?: string;
  message: string;
  /** Se setado, conversa fica linkada ao ticket (find-or-create por user+ticket) */
  ticketId?: string;
  /** Texto adicional injetado no system prompt (ex: contexto do ticket atual) */
  extraSystemContext?: string;
}): Promise<CopilotTurnResult> {
  // 1) Conversation: cria se não existe
  let conversationId = input.conversationId;
  if (!conversationId && input.ticketId) {
    // Find-or-create por ticket+user pra preservar contexto entre aberturas do drawer
    const existing = await prisma.copilotConversation.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
        ticketId: input.ticketId,
        archivedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (existing) conversationId = existing.id;
  }
  if (!conversationId) {
    const conv = await prisma.copilotConversation.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        ticketId: input.ticketId ?? null,
        title: input.message.slice(0, 80) || 'Nova conversa',
      },
      select: { id: true },
    });
    conversationId = conv.id;
  }

  // 2) Persiste user message
  await prisma.copilotMessage.create({
    data: {
      organizationId: input.organizationId,
      conversationId,
      role: 'user',
      content: input.message,
    },
  });

  // 3) Busca por similaridade
  const hits = await searchKnowledge(input.organizationId, input.message, 6);

  // 4) Pega histórico anterior pra contexto (últimas 10 msgs)
  const history = await prisma.copilotMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 11, // 10 + a que acabamos de gravar
    select: { role: true, content: true },
  });
  history.reverse();

  // 5) Config (system prompt customizado se houver)
  const cfg = await prisma.copilotConfig.findUnique({
    where: { organizationId: input.organizationId },
  });
  const systemBase = cfg?.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

  // 6) Monta prompt com contexto numerado
  const contextBlocks = hits
    .map((h, i) => formatContextBlock(i + 1, h))
    .join('\n\n---\n\n');

  const systemFull = [
    systemBase,
    input.extraSystemContext
      ? `\n=== TICKET ATUAL EM FOCO ===\n${input.extraSystemContext}\n=== FIM DO TICKET ===`
      : '',
    '',
    '=== FONTES INDEXADAS (cite com [n]) ===',
    contextBlocks || '(sem fontes relevantes encontradas)',
    '=== FIM DAS FONTES ===',
  ].join('\n');

  // 7) Chama Gemini
  const reply = await complete({
    system: systemFull,
    messages: history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      content: m.content,
    })),
    model: cfg?.geminiModel ?? undefined,
    temperature: 0.3,
    maxTokens: 1200,
  });

  const citations: Citation[] = hits.map((h) => ({
    chunkId: h.chunkId,
    sourceId: h.sourceId,
    refLabel: h.refLabel,
    refUrl: h.refUrl,
    score: h.score,
  }));

  // 8) Persiste resposta + citações
  await prisma.copilotMessage.create({
    data: {
      organizationId: input.organizationId,
      conversationId,
      role: 'assistant',
      content: reply,
      citations: citations as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.copilotConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return { assistantText: reply, citations, conversationId };
}

function formatContextBlock(idx: number, h: SearchHit): string {
  const head = h.refLabel ? `[${idx}] ${h.refLabel}` : `[${idx}] Trecho indexado`;
  const url = h.refUrl ? `\n(${h.refUrl})` : '';
  return `${head}${url}\n\n${h.text.slice(0, 1500)}`;
}
