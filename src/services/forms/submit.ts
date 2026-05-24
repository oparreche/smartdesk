import 'server-only';
import { Prisma, type FormFieldType } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { createTicket } from '@/src/services/tickets/create';
import { logger } from '@/src/lib/logger';

export class FormValidationError extends Error {
  constructor(public fieldKey: string | null, message: string) {
    super(message);
    this.name = 'FormValidationError';
  }
}

export class FormSubmissionRejectedError extends Error {
  constructor(message = 'Submissão rejeitada') {
    super(message);
    this.name = 'FormSubmissionRejectedError';
  }
}

export type SubmitFormInput = {
  slug: string;
  data: Record<string, FormDataEntryValue>;
  ip: string | null;
  userAgent: string | null;
};

export type SubmitFormResult = {
  ticketCode: string;
  successMessage: string;
};

/**
 * Processa submissão de formulário público. Lança FormValidationError para erros
 * de input do usuário, FormSubmissionRejectedError para rejeições silenciosas
 * (honeypot, form não publicado).
 */
export async function submitForm(input: SubmitFormInput): Promise<SubmitFormResult> {
  const form = await prisma.form.findFirst({
    where: { slug: input.slug, isPublished: true, deletedAt: null },
    include: {
      fields: { orderBy: { position: 'asc' } },
      organization: { select: { id: true, status: true } },
    },
  });

  if (!form || form.organization.status !== 'active') {
    throw new FormSubmissionRejectedError('Formulário indisponível');
  }

  // Honeypot — campo invisível que humanos não preenchem
  if (form.honeypotField) {
    const hp = input.data[form.honeypotField];
    if (typeof hp === 'string' && hp.trim()) {
      logger.warn({ slug: input.slug, ip: input.ip }, 'form honeypot triggered');
      throw new FormSubmissionRejectedError('Submissão rejeitada');
    }
  }

  // Coletar valores e validar
  const values: Record<string, string | string[]> = {};
  for (const f of form.fields) {
    const raw = input.data[f.key];
    const val = normalizeValue(f.type, raw);
    if (f.required) {
      const missing =
        val === null ||
        (typeof val === 'string' && !val.trim()) ||
        (Array.isArray(val) && val.length === 0);
      if (missing) throw new FormValidationError(f.key, `${f.label} é obrigatório`);
    }
    if (val !== null) values[f.key] = val;

    if (f.type === 'email' && typeof val === 'string' && val) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        throw new FormValidationError(f.key, `${f.label}: email inválido`);
      }
    }
  }

  // Mapear para ticket/requester/custom
  const requesterInput = { email: '' as string | null, name: '' as string | null, phone: '' as string | null, document: '' as string | null };
  let subject = '';
  let description = '';
  const customFields: Record<string, unknown> = {};

  for (const f of form.fields) {
    if (!f.mapsTo) continue;
    const v = values[f.key];
    if (v === undefined) continue;
    const text = Array.isArray(v) ? v.join(', ') : v;

    switch (f.mapsTo) {
      case 'ticket.subject': subject = text; break;
      case 'ticket.description': description = description ? `${description}\n\n${text}` : text; break;
      case 'requester.name': requesterInput.name = text; break;
      case 'requester.email': requesterInput.email = text; break;
      case 'requester.phone': requesterInput.phone = text; break;
      case 'requester.document': requesterInput.document = text; break;
      default:
        if (f.mapsTo.startsWith('custom.')) {
          customFields[f.mapsTo.slice(7)] = v;
        }
    }
  }

  // Para campos sem mapsTo, salvar no customFields com a key
  for (const f of form.fields) {
    if (f.mapsTo) continue;
    if (values[f.key] !== undefined) customFields[f.key] = values[f.key];
  }

  if (!subject) {
    subject = `Submissão de ${form.name}`;
  }

  // Cria registro de submission antes do ticket pra ter trilha mesmo se ticket falhar
  const submission = await prisma.formSubmission.create({
    data: {
      organizationId: form.organizationId,
      formId: form.id,
      rawData: JSON.parse(JSON.stringify(values)) as Prisma.InputJsonValue,
      ip: input.ip,
      userAgent: input.userAgent,
    },
    select: { id: true },
  });

  const ticket = await createTicket(form.organizationId, null, {
    subject,
    description: description || null,
    origin: 'form',
    priority: form.defaultPriority,
    queueId: form.defaultQueueId ?? null,
    customFields: Object.keys(customFields).length ? customFields : null,
    requester: {
      email: requesterInput.email || null,
      name: requesterInput.name || null,
      phone: requesterInput.phone || null,
      document: requesterInput.document || null,
    },
  });

  await prisma.formSubmission.update({
    where: { id: submission.id },
    data: { ticketId: ticket.id },
  });

  return {
    ticketCode: ticket.code,
    successMessage:
      form.successMessage?.trim() ||
      `Recebemos sua solicitação (${ticket.code}). Em breve nossa equipe entrará em contato.`,
  };
}

function normalizeValue(
  type: FormFieldType,
  raw: FormDataEntryValue | undefined,
): string | string[] | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return null; // ignora File no MVP
  const trimmed = raw.trim();
  if (!trimmed) return null;

  switch (type) {
    case 'email': return trimmed.toLowerCase();
    case 'document': return trimmed.replace(/\D+/g, '');
    case 'phone': return trimmed;
    case 'number':
    case 'currency': return trimmed.replace(',', '.');
    case 'multiselect':
      // Quando multiplos forem submetidos com mesmo name, FormData pega só o último.
      // Implementação acima ignora multiselect plural; UI pode usar checkbox group com nomes únicos.
      return [trimmed];
    case 'checkbox':
      return trimmed === 'on' || trimmed === 'true' ? 'true' : 'false';
    default:
      return trimmed;
  }
}
