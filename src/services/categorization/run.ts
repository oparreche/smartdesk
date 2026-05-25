import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { complete } from '@/src/lib/gemini';
import { getCategorizationConfig, resolveGeminiKey } from './config';
import { countKeywordMatches, asKeywordArray } from './keywords';
import {
  CATEGORIZATION_SYSTEM,
  buildCategorizationUserMessage,
  parseTagsFromResponse,
  type TagForPrompt,
} from './prompt';

export type CategorizeResult = {
  engine: 'keywords' | 'ai' | 'none';
  applied: string[];
  reason?: string;
};

type CandidateTag = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  minKeywordMatches: number;
};

/**
 * Categoriza um ticket aplicando tags com `autoCategorize`.
 *
 * - mode `keywords`: aplica quando atinge o mínimo de palavras-chave.
 * - mode `ai`: usa Gemini com as descrições das tags (fallback p/ keywords se a IA falhar/sem chave).
 * - mode `auto`: IA quando há chave; senão keywords.
 *
 * Idempotente: nunca duplica tags já presentes. Erros não derrubam o caller.
 */
export async function categorizeTicket(
  organizationId: string,
  ticketId: string,
  opts: { source?: 'auto' | 'manual' } = {},
): Promise<CategorizeResult> {
  const source = opts.source ?? 'auto';

  const config = await getCategorizationConfig(organizationId);
  if (!config.enabled) return { engine: 'none', applied: [], reason: 'disabled' };

  const tags = await prisma.tag.findMany({
    where: { organizationId, autoCategorize: true },
    select: { id: true, name: true, description: true, keywords: true, minKeywordMatches: true },
  });

  const candidates: CandidateTag[] = tags
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      keywords: asKeywordArray(t.keywords),
      minKeywordMatches: t.minKeywordMatches,
    }))
    // Precisa de algum critério: descrição (p/ IA) ou palavras-chave.
    .filter((t) => (t.description && t.description.trim()) || t.keywords.length > 0);

  if (candidates.length === 0) return { engine: 'none', applied: [], reason: 'no_tags' };

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId, deletedAt: null },
    select: {
      id: true,
      subject: true,
      description: true,
      tags: { select: { tagId: true } },
    },
  });
  if (!ticket) return { engine: 'none', applied: [], reason: 'ticket_not_found' };

  const alreadyTagged = new Set(ticket.tags.map((t) => t.tagId));
  const text = `${ticket.subject}\n\n${ticket.description ?? ''}`;

  // Decide o motor.
  const wantsAi = config.mode === 'ai' || config.mode === 'auto';
  const geminiKey = wantsAi ? await resolveGeminiKey(organizationId) : null;

  let engine: 'keywords' | 'ai' = 'keywords';
  let toApply: CandidateTag[] = [];

  if (wantsAi && geminiKey) {
    try {
      toApply = await classifyWithAi(candidates, ticket.subject, text, geminiKey);
      engine = 'ai';
    } catch (err) {
      logger.warn({ err, ticketId, organizationId }, 'categorization AI failed; falling back to keywords');
      toApply = classifyWithKeywords(candidates, text);
      engine = 'keywords';
    }
  } else {
    // mode keywords, ou auto/ai sem chave disponível
    toApply = classifyWithKeywords(candidates, text);
    engine = 'keywords';
  }

  // Aplica só as novas.
  const newOnes = toApply.filter((t) => !alreadyTagged.has(t.id));
  if (newOnes.length === 0) {
    return { engine, applied: [], reason: 'no_match' };
  }

  await prisma.$transaction([
    prisma.ticketTag.createMany({
      data: newOnes.map((t) => ({ ticketId: ticket.id, tagId: t.id })),
      skipDuplicates: true,
    }),
    ...newOnes.map((t) =>
      prisma.ticketEvent.create({
        data: {
          organizationId,
          ticketId: ticket.id,
          type: 'tag_added',
          payload: { tag: t.name, by: 'categorization', engine, source } as Prisma.InputJsonObject,
        },
      }),
    ),
  ]);

  logger.info(
    { organizationId, ticketId, engine, source, applied: newOnes.map((t) => t.name) },
    'categorization applied',
  );

  return { engine, applied: newOnes.map((t) => t.name) };
}

function classifyWithKeywords(candidates: CandidateTag[], text: string): CandidateTag[] {
  return candidates.filter((t) => {
    if (t.keywords.length === 0) return false;
    const { count } = countKeywordMatches(text, t.keywords);
    return count >= Math.max(1, t.minKeywordMatches);
  });
}

async function classifyWithAi(
  candidates: CandidateTag[],
  subject: string,
  body: string,
  apiKey: string,
): Promise<CandidateTag[]> {
  const forPrompt: TagForPrompt[] = candidates.map((t) => ({
    name: t.name,
    description: t.description,
    keywords: t.keywords,
  }));

  const response = await complete({
    apiKey,
    system: CATEGORIZATION_SYSTEM,
    temperature: 0,
    maxTokens: 256,
    messages: [
      { role: 'user', content: buildCategorizationUserMessage(forPrompt, { subject, body }) },
    ],
  });

  const names = parseTagsFromResponse(response);
  if (names.length === 0) return [];

  // Casa nomes retornados com tags reais (case-insensitive), só do conjunto candidato.
  const byNorm = new Map(candidates.map((t) => [t.name.trim().toLowerCase(), t]));
  const picked: CandidateTag[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const t = byNorm.get(n.trim().toLowerCase());
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      picked.push(t);
    }
  }
  return picked;
}
