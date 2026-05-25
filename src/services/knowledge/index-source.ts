import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { embedBatch } from '@/src/lib/gemini';
import { chunkText, estimateTokens } from './chunk';
import { contentHash, fetchUrlAsText, htmlToText, extractFromBuffer } from './extract';
import { getObjectBuffer } from '@/src/lib/s3';

/**
 * Indexa uma KnowledgeSource. Carrega o conteúdo conforme o tipo, chunka,
 * embeda em batch e persiste. Idempotente: usa contentHash pra pular
 * re-indexação se conteúdo não mudou.
 */
export async function indexSource(sourceId: string): Promise<{ chunks: number; skipped: boolean }> {
  const src = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!src || src.deletedAt) return { chunks: 0, skipped: true };

  await prisma.knowledgeSource.update({
    where: { id: src.id },
    data: { status: 'indexing', error: null },
  });

  try {
    const loaded = await loadContent(src);
    if (!loaded || !loaded.text || loaded.text.length < 20) {
      await prisma.knowledgeSource.update({
        where: { id: src.id },
        data: { status: 'failed', error: 'Conteúdo vazio ou inválido' },
      });
      return { chunks: 0, skipped: false };
    }

    const hash = contentHash(loaded.text);
    if (src.contentHash === hash) {
      await prisma.knowledgeSource.update({
        where: { id: src.id },
        data: { status: 'indexed', lastIndexedAt: new Date() },
      });
      return { chunks: src.chunkCount, skipped: true };
    }

    const pieces = chunkText(loaded.text);
    if (pieces.length === 0) {
      await prisma.knowledgeSource.update({
        where: { id: src.id },
        data: { status: 'failed', error: 'Não gerou chunks' },
      });
      return { chunks: 0, skipped: false };
    }

    // Limpa chunks antigos
    await prisma.knowledgeChunk.deleteMany({ where: { sourceId: src.id } });

    const vectors = await embedBatch({
      texts: pieces,
      taskType: 'RETRIEVAL_DOCUMENT',
    });

    if (vectors.length !== pieces.length) {
      throw new Error(`embed batch retornou ${vectors.length} vetores pra ${pieces.length} chunks`);
    }

    await prisma.knowledgeChunk.createMany({
      data: pieces.map((text, i) => ({
        organizationId: src.organizationId,
        sourceId: src.id,
        position: i,
        text,
        tokens: estimateTokens(text),
        embedding: vectors[i]! as unknown as Prisma.InputJsonValue,
        refLabel: loaded.label,
        refUrl: loaded.url,
      })),
    });

    await prisma.knowledgeSource.update({
      where: { id: src.id },
      data: {
        status: 'indexed',
        chunkCount: pieces.length,
        contentHash: hash,
        error: null,
        lastIndexedAt: new Date(),
        name: loaded.label ?? src.name,
      },
    });

    return { chunks: pieces.length, skipped: false };
  } catch (err) {
    const msg = (err as Error).message;
    logger.warn({ err, sourceId }, 'indexSource failed');
    await prisma.knowledgeSource.update({
      where: { id: src.id },
      data: { status: 'failed', error: msg.slice(0, 1000) },
    });
    return { chunks: 0, skipped: false };
  }
}

type LoadedContent = { text: string; label: string | null; url: string | null };

async function loadContent(src: {
  type: 'url' | 'kb_article' | 'ticket' | 'upload';
  sourceUrl: string | null;
  refId: string | null;
  fileKey?: string | null;
  name: string;
  organizationId: string;
}): Promise<LoadedContent | null> {
  if (src.type === 'url' && src.sourceUrl) {
    const r = await fetchUrlAsText(src.sourceUrl);
    return { text: r.text, label: r.title, url: src.sourceUrl };
  }
  if (src.type === 'kb_article' && src.refId) {
    const art = await prisma.kbArticle.findFirst({
      where: { id: src.refId, organizationId: src.organizationId, deletedAt: null },
      select: { title: true, content: true, slug: true },
    });
    if (!art) return null;
    const text = `${art.title}\n\n${art.content}`;
    return { text, label: art.title, url: `/knowledge/${art.slug}` };
  }
  if (src.type === 'ticket' && src.refId) {
    const t = await prisma.ticket.findFirst({
      where: { id: src.refId, organizationId: src.organizationId, deletedAt: null },
      select: {
        code: true,
        subject: true,
        description: true,
        status: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { type: true, bodyText: true, createdAt: true },
        },
      },
    });
    if (!t) return null;
    const parts = [
      `Ticket ${t.code}: ${t.subject}`,
      t.description ? `\nDescrição:\n${t.description}` : '',
      '\nConversa:',
      ...t.messages.map((m) => `[${m.type}] ${stripHtmlMaybe(m.bodyText ?? '')}`.slice(0, 4000)),
    ];
    return { text: parts.join('\n'), label: `Ticket ${t.code}`, url: `/tickets/${t.code}` };
  }
  if (src.type === 'upload' && src.fileKey) {
    const buf = await getObjectBuffer(src.fileKey);
    // O nome amigável já vem em src.name; mimetype derivamos pela extensão se não vier
    const mimeType = guessMimeFromName(src.name);
    const text = await extractFromBuffer(buf, src.name, mimeType);
    return { text, label: src.name, url: null };
  }
  return null;
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function stripHtmlMaybe(s: string): string {
  if (s.includes('<') && s.includes('>')) return htmlToText(s);
  return s;
}
