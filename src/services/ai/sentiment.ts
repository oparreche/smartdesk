import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { complete, isAiConfigured, AiNotConfiguredError } from '@/src/lib/gemini';
import { audit } from '@/src/services/audit/log';

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'angry';

export type SentimentResult = {
  sentiment: Sentiment;
  confidence: number;
  reasoning: string;
};

const SYSTEM_PROMPT = `Você analisa o tom emocional de mensagens de clientes em português brasileiro.
Classifique em UMA das categorias:
- positive: cliente elogiando, agradecendo, satisfeito
- neutral: pedido informativo, dúvida simples, neutro emocional
- negative: cliente reclamando ou frustrado mas educado
- angry: cliente muito irritado, hostil, ameaças, palavrões, urgência crítica

Responda APENAS um JSON válido nesse formato exato (sem markdown, sem explicação fora do JSON):
{"sentiment":"<categoria>","confidence":<0.0-1.0>,"reasoning":"<frase curta em português explicando>"}`;

const MAX_INPUT_CHARS = 4_000;

export async function classifySentiment(text: string): Promise<SentimentResult | null> {
  if (!isAiConfigured()) return null;
  const input = text.trim().slice(0, MAX_INPUT_CHARS);
  if (!input) return null;

  try {
    const raw = await complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: input }],
      temperature: 0.1,
      maxTokens: 200,
    });
    return parseResponse(raw);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return null;
    logger.warn({ err }, 'sentiment.classify failed');
    return null;
  }
}

function parseResponse(raw: string): SentimentResult | null {
  // Remove markdown code fence se vier
  const cleaned = raw
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed === 'object' &&
      parsed &&
      ['positive', 'neutral', 'negative', 'angry'].includes(parsed.sentiment) &&
      typeof parsed.confidence === 'number'
    ) {
      return {
        sentiment: parsed.sentiment as Sentiment,
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        reasoning: String(parsed.reasoning ?? '').slice(0, 200),
      };
    }
  } catch {
    /* falha de parse */
  }
  return null;
}

/**
 * Classifica o sentimento do ticket e, se irritado, eleva prioridade pra urgent.
 */
export async function analyzeTicketSentiment(
  organizationId: string,
  ticketId: string,
): Promise<SentimentResult | null> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId, deletedAt: null },
    select: {
      id: true,
      subject: true,
      description: true,
      priority: true,
      customFields: true,
    },
  });
  if (!ticket) return null;

  const text = [ticket.subject, ticket.description ?? ''].filter(Boolean).join('\n\n');
  const result = await classifySentiment(text);
  if (!result) return null;

  // Salva no customFields._sentiment pra exibir no painel
  const existing = (ticket.customFields as Record<string, unknown> | null) ?? {};
  const newFields = {
    ...existing,
    _sentiment: {
      label: result.sentiment,
      confidence: result.confidence,
      reasoning: result.reasoning,
      analyzedAt: new Date().toISOString(),
    },
  };

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { customFields: newFields },
  });

  // Se irritado/muito negativo + prioridade ainda não urgente/crítica → eleva
  const shouldEscalate =
    result.sentiment === 'angry' &&
    result.confidence >= 0.7 &&
    !['urgent', 'critical'].includes(ticket.priority);

  if (shouldEscalate) {
    await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticketId },
        data: { priority: 'urgent' },
      }),
      prisma.ticketEvent.create({
        data: {
          organizationId,
          ticketId,
          type: 'priority_changed',
          payload: {
            from: ticket.priority,
            to: 'urgent',
            by: 'ai_sentiment',
            reasoning: result.reasoning.slice(0, 200),
          },
        },
      }),
    ]);
    logger.info(
      { ticketId, oldPriority: ticket.priority, newPriority: 'urgent', sentiment: result.sentiment },
      'sentiment.auto_escalated',
    );
  }

  await audit({
    organizationId,
    actorUserId: null,
    action: 'ai.ticket.sentiment',
    resourceType: 'ticket',
    resourceId: ticketId,
    diff: {
      after: {
        sentiment: result.sentiment,
        confidence: result.confidence,
        escalated: shouldEscalate,
      },
    },
  });

  return result;
}
