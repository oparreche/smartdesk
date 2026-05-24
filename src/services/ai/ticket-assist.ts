import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { complete } from '@/src/lib/gemini';
import { audit } from '@/src/services/audit/log';

const MAX_MESSAGE_CHARS = 4_000;
const MAX_MESSAGES = 10;
const BODY_TRUNCATE = 2_000;

type TicketContext = {
  code: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  requester: { name: string | null; email: string | null };
  messages: Array<{
    type: string;
    channel: string | null;
    author: string;
    body: string;
    isInternal: boolean;
    createdAt: Date;
  }>;
};

async function loadContext(
  organizationId: string,
  ticketId: string,
): Promise<TicketContext | null> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId, deletedAt: null },
    select: {
      code: true,
      subject: true,
      description: true,
      priority: true,
      status: true,
      requester: { select: { name: true, email: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: MAX_MESSAGES,
        select: {
          type: true,
          channel: true,
          bodyText: true,
          bodyHtml: true,
          createdAt: true,
          authorUser: { select: { name: true } },
        },
      },
    },
  });
  if (!ticket) return null;

  return {
    code: ticket.code,
    subject: ticket.subject,
    description: ticket.description ?? '',
    priority: ticket.priority,
    status: ticket.status,
    requester: ticket.requester,
    messages: ticket.messages
      .reverse()
      .map((m) => ({
        type: m.type,
        channel: m.channel,
        author:
          m.authorUser?.name ??
          (m.type === 'incoming_email' || m.type === 'incoming_whatsapp'
            ? (ticket.requester.name ?? ticket.requester.email ?? 'Solicitante')
            : 'Sistema'),
        body: (m.bodyText ?? m.bodyHtml ?? '').slice(0, BODY_TRUNCATE),
        isInternal: m.type === 'internal_note',
        createdAt: m.createdAt,
      })),
  };
}

function buildTranscript(ctx: TicketContext): string {
  const lines: string[] = [];
  lines.push(`Ticket: ${ctx.code} — ${ctx.subject}`);
  lines.push(`Prioridade: ${ctx.priority} · Status: ${ctx.status}`);
  if (ctx.requester.name || ctx.requester.email) {
    lines.push(`Solicitante: ${ctx.requester.name ?? ''} <${ctx.requester.email ?? '?'}>`);
  }
  if (ctx.description) {
    lines.push('', 'Descrição inicial:', ctx.description.slice(0, BODY_TRUNCATE));
  }
  if (ctx.messages.length > 0) {
    lines.push('', 'Histórico (mais antigas → recentes):');
    for (const m of ctx.messages) {
      const tag = m.isInternal ? '[NOTA INTERNA]' : `[${m.channel ?? m.type}]`;
      lines.push(`${tag} ${m.author}: ${m.body}`);
    }
  }
  const full = lines.join('\n');
  return full.length > MAX_MESSAGE_CHARS ? full.slice(-MAX_MESSAGE_CHARS) : full;
}

export async function summarizeTicket(
  organizationId: string,
  actorUserId: string,
  ticketId: string,
): Promise<{ summary: string }> {
  const ctx = await loadContext(organizationId, ticketId);
  if (!ctx) throw new Error('Ticket não encontrado');

  const transcript = buildTranscript(ctx);

  const summary = await complete({
    system:
      'Você é um assistente de suporte. Resume tickets de atendimento em português do Brasil, ' +
      'objetivo, em até 4 bullets curtos. Inclua: (1) problema principal, (2) o que o cliente já informou, ' +
      '(3) o que a equipe já fez, (4) próximo passo recomendado. Não invente fatos.',
    messages: [{ role: 'user', content: transcript }],
    maxTokens: 500,
    temperature: 0.2,
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'ai.ticket.summary',
    resourceType: 'ticket',
    resourceId: ticketId,
    diff: { after: { length: summary.length } },
  });

  return { summary };
}

export async function suggestReply(
  organizationId: string,
  actorUserId: string,
  ticketId: string,
  instruction?: string,
): Promise<{ draft: string }> {
  const ctx = await loadContext(organizationId, ticketId);
  if (!ctx) throw new Error('Ticket não encontrado');

  const transcript = buildTranscript(ctx);
  const cleanInstruction = (instruction ?? '').trim().slice(0, 500);

  const userTurn = cleanInstruction
    ? `${transcript}\n\nInstrução do atendente: ${cleanInstruction}`
    : transcript;

  const draft = await complete({
    system:
      'Você é um agente de suporte ao cliente. Redija uma resposta em português do Brasil ' +
      'para enviar ao solicitante. Seja cordial, direto e empático. Não invente dados que não estão no ticket. ' +
      'Se faltar informação crítica, peça gentilmente. Não inclua saudações de início/fim genéricas redundantes — ' +
      'a primeira linha já deve atender. Não use marcadores de papel ("Caro cliente,"). ' +
      'Não copie blocos do histórico — escreva uma resposta nova.',
    messages: [{ role: 'user', content: userTurn }],
    maxTokens: 700,
    temperature: 0.5,
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'ai.ticket.suggest_reply',
    resourceType: 'ticket',
    resourceId: ticketId,
    diff: { after: { length: draft.length, hasInstruction: !!cleanInstruction } },
  });

  return { draft };
}
