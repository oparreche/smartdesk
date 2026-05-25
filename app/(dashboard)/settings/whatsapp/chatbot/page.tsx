import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { formatDateTime } from '@/src/lib/format';
import { ChatbotConfigForm, type RequiredFieldInput } from './config-form';

export const metadata = { title: 'Chatbot WhatsApp — SmartDesk' };

export default async function ChatbotSettingsPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'whatsapp:manage');

  const connections = await prisma.whatsappConnection.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, status: 'active' },
    select: { id: true, displayPhoneNumber: true },
    orderBy: { createdAt: 'desc' },
  });

  // Mostra a config da PRIMEIRA conexão (por enquanto 1 chatbot por org)
  const firstConn = connections[0];
  const cfg = firstConn
    ? await prisma.chatbotConfig.findUnique({
        where: { connectionId: firstConn.id },
      })
    : null;

  const recentSessions = await prisma.chatbotSession.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { lastMessageAt: 'desc' },
    take: 10,
    select: {
      id: true,
      fromPhone: true,
      state: true,
      turns: true,
      startedAt: true,
      lastMessageAt: true,
      completedAt: true,
      ticketId: true,
    },
  });

  const initialValues = cfg
    ? {
        connectionId: cfg.connectionId,
        mode: cfg.mode,
        greeting: cfg.greeting,
        systemPrompt: cfg.systemPrompt,
        maxTurns: cfg.maxTurns,
        geminiModel: cfg.geminiModel,
        requiredFields: (cfg.requiredFields as unknown as RequiredFieldInput[]) ?? [],
        escalationKeywords: ((cfg.escalationKeywords as unknown) as string[]) ?? [],
        outOfHoursMessage: cfg.outOfHoursMessage,
        businessHoursStart: cfg.businessHoursStart,
        businessHoursEnd: cfg.businessHoursEnd,
        businessTimezone: cfg.businessTimezone,
      }
    : null;

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/settings/whatsapp" className="text-muted-foreground hover:text-foreground hover:underline">
            WhatsApp
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            Chatbot
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Chatbot WhatsApp
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Atende mensagens inbound via Gemini antes de virar ticket. Coleta os campos que você
          definir e escala pra atendente humano por palavra-chave, limite de turnos ou por decisão
          do próprio modelo.
        </p>
      </header>

      {connections.length === 0 ? (
        <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Conecte primeiro um número WhatsApp em{' '}
          <Link href="/settings/whatsapp" className="text-primary hover:underline">
            Configurações → WhatsApp
          </Link>
          .
        </p>
      ) : (
        <>
          <ChatbotConfigForm
            connections={connections}
            initialValues={initialValues}
            hasKey={Boolean(cfg?.geminiApiKeyEnc)}
          />

          {recentSessions.length > 0 ? (
            <section className="card flex flex-col gap-3 p-5">
              <header>
                <p className="divider-eyebrow text-muted-foreground">
                  <span className="numeral-serif text-[0.6875rem] text-primary">02</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  Sessões recentes
                </p>
              </header>
              <ul className="flex flex-col divide-y divide-border-subtle">
                {recentSessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <div className="flex min-w-0 flex-col">
                      <span className="font-mono text-sm text-foreground">{s.fromPhone}</span>
                      <span className="text-[0.6875rem] text-muted-foreground">
                        {formatDateTime(s.lastMessageAt)} · {s.turns} turn{s.turns !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StateBadge state={s.state} />
                      {s.ticketId ? (
                        <Link
                          href={`/tickets`}
                          className="text-[0.6875rem] text-primary hover:underline"
                        >
                          ticket
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    active:    { bg: 'bg-info-soft',        text: 'text-info' },
    escalated: { bg: 'bg-warning-soft',     text: 'text-warning' },
    abandoned: { bg: 'bg-muted',            text: 'text-muted-foreground' },
    completed: { bg: 'bg-success-soft',     text: 'text-success' },
  };
  const s = map[state] ?? map.active!;
  return <span className={`pill ${s.bg} ${s.text}`}>{state}</span>;
}
