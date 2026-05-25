import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { prisma } from '@/src/lib/prisma';
import { formatDateTime } from '@/src/lib/format';
import { CopilotChat } from './chat';

export const metadata = { title: 'Copilot — SmartDesk' };

export default async function CopilotPage() {
  const ctx = await getOrgContext();

  const [chunkCount, sourceCount, recentConversations] = await Promise.all([
    prisma.knowledgeChunk.count({ where: { organizationId: ctx.organizationId } }),
    prisma.knowledgeSource.count({
      where: { organizationId: ctx.organizationId, deletedAt: null, status: 'indexed' },
    }),
    prisma.copilotConversation.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, title: true, updatedAt: true },
    }),
  ]);

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="divider-eyebrow text-muted-foreground">Interno · time</p>
            <h1 className="mt-1 font-display text-[2rem] font-semibold leading-tight tracking-tight">
              Copilot
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Faça perguntas sobre os documentos, knowledge base e tickets indexados da sua
              organização. Respostas citam as fontes.
            </p>
          </div>
          <Link
            href="/copilot/sources"
            className="rounded-sm border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:border-primary/40 hover:text-primary"
          >
            Gerenciar fontes ({sourceCount}) →
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <CopilotChat totalChunks={chunkCount} />

        <aside className="flex flex-col gap-3">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Suas conversas</p>
            {recentConversations.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Comece uma conversa — fica salva pra continuar depois.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-border-subtle">
                {recentConversations.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate text-foreground">{c.title}</span>
                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                      {formatDateTime(c.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Como funciona</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              O copilot usa RAG: sua pergunta gera um vetor que é comparado contra todos os chunks
              indexados via cosine similarity. Os 6 trechos mais próximos viram contexto pra
              resposta do Gemini.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Pra adicionar mais conhecimento, abra Gerenciar fontes.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
