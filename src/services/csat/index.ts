import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/src/lib/prisma';
import { sendEmail, brandedEmail } from '@/src/lib/mailer';
import { env } from '@/src/lib/env';
import { audit } from '@/src/services/audit/log';
import { logger } from '@/src/lib/logger';

export class CsatError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'CsatError';
  }
}

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Cria uma pesquisa CSAT pro ticket e dispara o email pro solicitante.
 * Idempotente: se já existe uma survey ativa pro ticket, retorna ela sem reenviar.
 */
export async function createAndSendCsat(input: {
  organizationId: string;
  ticketId: string;
}): Promise<{ surveyId: string; sent: boolean }> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: input.ticketId, organizationId: input.organizationId, deletedAt: null },
    select: {
      id: true,
      code: true,
      subject: true,
      requester: { select: { email: true, name: true } },
      organization: { select: { name: true } },
    },
  });
  if (!ticket) throw new CsatError('Ticket não encontrado', 'not_found');
  if (!ticket.requester.email) {
    throw new CsatError('Solicitante sem email', 'no_email');
  }

  const existing = await prisma.csatSurvey.findFirst({
    where: {
      organizationId: input.organizationId,
      ticketId: input.ticketId,
      submittedAt: null,
    },
    select: { id: true },
  });
  if (existing) {
    return { surveyId: existing.id, sent: false };
  }

  const token = newToken();
  const survey = await prisma.csatSurvey.create({
    data: {
      organizationId: input.organizationId,
      ticketId: input.ticketId,
      requesterEmail: ticket.requester.email,
      token,
    },
    select: { id: true },
  });

  const url = `${env.APP_URL}/csat/${token}`;
  const html = brandedEmail({
    preheader: `Como foi seu atendimento? — ${ticket.code}`,
    title: 'Avalie seu atendimento',
    body: `
      <p>Olá${ticket.requester.name ? `, ${ticket.requester.name}` : ''},</p>
      <p>Seu chamado <strong>${ticket.code} — ${escapeHtml(ticket.subject)}</strong> foi
      finalizado. Adoraríamos saber como foi a experiência.</p>
      <p>Leva menos de 10 segundos:</p>
    `,
    cta: { label: 'Avaliar atendimento', href: url },
  });
  const text = `Olá${ticket.requester.name ? `, ${ticket.requester.name}` : ''},

Seu chamado ${ticket.code} — ${ticket.subject} foi finalizado. Avalie em:
${url}

Obrigado!`;

  try {
    await sendEmail({
      to: ticket.requester.email,
      subject: `[${ticket.code}] Como foi seu atendimento?`,
      html,
      text,
    });
  } catch (err) {
    logger.warn({ err, ticketId: input.ticketId }, 'csat.send email failed');
  }

  await audit({
    organizationId: input.organizationId,
    actorUserId: null,
    action: 'csat.sent',
    resourceType: 'ticket',
    resourceId: input.ticketId,
    diff: { after: { surveyId: survey.id, requesterEmail: ticket.requester.email } },
  });

  return { surveyId: survey.id, sent: true };
}

export async function getSurveyByToken(token: string) {
  return prisma.csatSurvey.findFirst({
    where: { token },
    select: {
      id: true,
      organizationId: true,
      ticketId: true,
      rating: true,
      comment: true,
      submittedAt: true,
      ticket: {
        select: {
          code: true,
          subject: true,
          organization: { select: { name: true } },
        },
      },
    },
  });
}

export async function submitSurvey(input: {
  token: string;
  rating: number;
  comment?: string;
  ipAddress?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (input.rating < 1 || input.rating > 5) {
    return { ok: false, reason: 'rating_out_of_range' };
  }
  const survey = await prisma.csatSurvey.findFirst({
    where: { token: input.token },
    select: { id: true, organizationId: true, ticketId: true, submittedAt: true },
  });
  if (!survey) return { ok: false, reason: 'not_found' };
  if (survey.submittedAt) return { ok: false, reason: 'already_submitted' };

  await prisma.csatSurvey.update({
    where: { id: survey.id },
    data: {
      rating: input.rating,
      comment: input.comment?.trim().slice(0, 2000) || null,
      submittedAt: new Date(),
      ipAddress: input.ipAddress?.slice(0, 45),
    },
  });

  await prisma.ticketEvent.create({
    data: {
      organizationId: survey.organizationId,
      ticketId: survey.ticketId,
      type: 'csat_received',
      payload: { rating: input.rating, hasComment: Boolean(input.comment) },
    },
  });

  await audit({
    organizationId: survey.organizationId,
    actorUserId: null,
    action: 'csat.submitted',
    resourceType: 'ticket',
    resourceId: survey.ticketId,
    diff: { after: { rating: input.rating, hasComment: Boolean(input.comment) } },
  });

  // Webhook outbound
  try {
    const { dispatchEvent } = await import('@/src/services/webhooks');
    await dispatchEvent({
      organizationId: survey.organizationId,
      event: 'csat.received',
      payload: {
        ticketId: survey.ticketId,
        rating: input.rating,
        comment: input.comment ?? null,
      },
    });
  } catch {
    /* noop */
  }

  return { ok: true };
}

export type CsatStats = {
  total: number;
  responded: number;
  responseRate: number;
  avgRating: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  recent: Array<{
    id: string;
    rating: number;
    comment: string | null;
    submittedAt: Date;
    ticketCode: string;
  }>;
};

export async function getOrgCsatStats(
  organizationId: string,
  sinceDays = 30,
): Promise<CsatStats> {
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
  const surveys = await prisma.csatSurvey.findMany({
    where: { organizationId, sentAt: { gte: since } },
    select: { id: true, rating: true, submittedAt: true, comment: true, ticket: { select: { code: true } } },
  });
  const responded = surveys.filter((s) => s.rating !== null);
  const total = surveys.length;
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const s of responded) {
    if (s.rating! >= 1 && s.rating! <= 5) {
      dist[s.rating! as 1 | 2 | 3 | 4 | 5]++;
      sum += s.rating!;
    }
  }
  const recent = responded
    .filter((s) => s.submittedAt)
    .sort((a, b) => b.submittedAt!.getTime() - a.submittedAt!.getTime())
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      rating: s.rating!,
      comment: s.comment,
      submittedAt: s.submittedAt!,
      ticketCode: s.ticket.code,
    }));

  return {
    total,
    responded: responded.length,
    responseRate: total > 0 ? responded.length / total : 0,
    avgRating: responded.length > 0 ? sum / responded.length : null,
    distribution: dist,
    recent,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
