import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { embed } from '@/src/lib/gemini';

export type SearchHit = {
  chunkId: string;
  sourceId: string;
  score: number;
  text: string;
  refLabel: string | null;
  refUrl: string | null;
};

// Cache LRU simples em memória pra embeddings de queries repetidas (TTL 1h).
const queryCache = new Map<string, { vec: number[]; at: number }>();
const QUERY_CACHE_TTL = 60 * 60 * 1000;
const QUERY_CACHE_MAX = 500;

export async function searchKnowledge(
  organizationId: string,
  query: string,
  topK = 6,
): Promise<SearchHit[]> {
  if (!query.trim()) return [];

  const cacheKey = `${organizationId}::${query.trim().toLowerCase()}`;
  let qvec: number[] | null = null;
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < QUERY_CACHE_TTL) {
    qvec = cached.vec;
  } else {
    qvec = await embed({ text: query, taskType: 'RETRIEVAL_QUERY' });
    queryCache.set(cacheKey, { vec: qvec, at: Date.now() });
    if (queryCache.size > QUERY_CACHE_MAX) {
      const firstKey = queryCache.keys().next().value;
      if (firstKey) queryCache.delete(firstKey);
    }
  }

  // Pega TODOS os chunks indexados da org. Em volume baixo (<50k) é OK.
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { organizationId },
    select: {
      id: true,
      sourceId: true,
      text: true,
      embedding: true,
      refLabel: true,
      refUrl: true,
    },
  });

  if (chunks.length === 0) return [];

  const scored = chunks
    .map((c) => {
      const vec = c.embedding as unknown as number[];
      const score = cosine(qvec!, vec);
      return {
        chunkId: c.id,
        sourceId: c.sourceId,
        score,
        text: c.text,
        refLabel: c.refLabel,
        refUrl: c.refUrl,
      };
    })
    .filter((h) => Number.isFinite(h.score));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
