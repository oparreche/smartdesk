import 'server-only';
import { Prisma, type TicketPriority, type FormFieldType } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';
import { slugify } from './slug';

export type FormFieldMap =
  | 'ticket.subject'
  | 'ticket.description'
  | 'requester.name'
  | 'requester.email'
  | 'requester.phone'
  | 'requester.document'
  | `custom.${string}`;

export async function listForms(organizationId: string) {
  return prisma.form.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      isPublished: true,
      defaultQueueId: true,
      defaultPriority: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { fields: true, submissions: true } },
    },
  });
}

export async function getForm(organizationId: string, formId: string) {
  return prisma.form.findFirst({
    where: { id: formId, organizationId, deletedAt: null },
    include: {
      fields: { orderBy: { position: 'asc' } },
    },
  });
}

export async function getPublishedFormBySlug(slug: string) {
  return prisma.form.findFirst({
    where: { slug, isPublished: true, deletedAt: null },
    include: {
      fields: { orderBy: { position: 'asc' } },
      organization: { select: { id: true, name: true, slug: true, status: true } },
    },
  });
}

export async function createForm(
  organizationId: string,
  actorUserId: string,
  input: { name: string; description?: string },
): Promise<{ id: string; slug: string }> {
  const name = input.name.trim();
  if (!name) throw new Error('Nome obrigatório');

  let slug = slugify(name);
  if (!slug) throw new Error('Nome inválido');

  const existing = await prisma.form.findFirst({
    where: { organizationId, slug, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const honeypotField = 'website_hp'; // nome do campo invisível anti-bot
  const created = await prisma.$transaction(async (tx) => {
    const form = await tx.form.create({
      data: {
        organizationId,
        slug,
        name,
        description: input.description?.trim() || null,
        honeypotField,
        successMessage: 'Recebemos sua solicitação. Em breve nossa equipe entrará em contato.',
      },
      select: { id: true, slug: true },
    });
    // Campos padrão: nome, email, assunto, mensagem
    await tx.formField.createMany({
      data: [
        { organizationId, formId: form.id, key: 'name', label: 'Seu nome', type: 'text', required: true, position: 0, mapsTo: 'requester.name' },
        { organizationId, formId: form.id, key: 'email', label: 'Email', type: 'email', required: true, position: 1, mapsTo: 'requester.email' },
        { organizationId, formId: form.id, key: 'subject', label: 'Assunto', type: 'text', required: true, position: 2, mapsTo: 'ticket.subject' },
        { organizationId, formId: form.id, key: 'message', label: 'Mensagem', type: 'textarea', required: true, position: 3, mapsTo: 'ticket.description' },
      ],
    });
    return form;
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'form.created',
    resourceType: 'form',
    resourceId: created.id,
    diff: { after: { name, slug: created.slug } },
  });

  return created;
}

export async function updateForm(
  organizationId: string,
  actorUserId: string,
  formId: string,
  input: {
    name?: string;
    description?: string | null;
    isPublished?: boolean;
    successMessage?: string | null;
    defaultQueueId?: string | null;
    defaultPriority?: TicketPriority;
  },
): Promise<void> {
  const existing = await prisma.form.findFirst({
    where: { id: formId, organizationId, deletedAt: null },
    select: { id: true, name: true, isPublished: true, slug: true },
  });
  if (!existing) throw new Error('Formulário não encontrado');

  const data: Prisma.FormUpdateInput = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error('Nome obrigatório');
    data.name = n;
  }
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.isPublished !== undefined) data.isPublished = input.isPublished;
  if (input.successMessage !== undefined) data.successMessage = input.successMessage?.trim() || null;
  if (input.defaultQueueId !== undefined) {
    data.defaultQueueId = input.defaultQueueId || null;
  }
  if (input.defaultPriority !== undefined) data.defaultPriority = input.defaultPriority;

  if (Object.keys(data).length === 0) return;

  await prisma.form.update({ where: { id: formId }, data });

  await audit({
    organizationId,
    actorUserId,
    action: 'form.updated',
    resourceType: 'form',
    resourceId: formId,
    diff: { before: existing, after: input },
  });
}

export async function deleteForm(
  organizationId: string,
  actorUserId: string,
  formId: string,
): Promise<void> {
  const existing = await prisma.form.findFirst({
    where: { id: formId, organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) throw new Error('Formulário não encontrado');

  await prisma.form.update({
    where: { id: formId },
    data: { deletedAt: new Date(), isPublished: false },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'form.deleted',
    resourceType: 'form',
    resourceId: formId,
    diff: { before: existing },
  });
}

// ─── Campos ───────────────────────────────────────────────────────

const VALID_MAPS_TO = new Set<string>([
  'ticket.subject',
  'ticket.description',
  'requester.name',
  'requester.email',
  'requester.phone',
  'requester.document',
]);

function validateMapsTo(mapsTo: string | null | undefined): string | null {
  if (!mapsTo) return null;
  if (VALID_MAPS_TO.has(mapsTo)) return mapsTo;
  if (mapsTo.startsWith('custom.') && mapsTo.length > 7 && /^custom\.[a-z0-9_]+$/i.test(mapsTo)) {
    return mapsTo;
  }
  throw new Error(`mapsTo inválido: ${mapsTo}`);
}

export async function addFormField(
  organizationId: string,
  actorUserId: string,
  formId: string,
  input: {
    key?: string;
    label: string;
    type: FormFieldType;
    required?: boolean;
    placeholder?: string;
    helpText?: string;
    mapsTo?: string | null;
    options?: string[];
  },
): Promise<{ id: string }> {
  const form = await prisma.form.findFirst({
    where: { id: formId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!form) throw new Error('Formulário não encontrado');

  const baseKey = (input.key?.trim() || slugify(input.label).replace(/-/g, '_') || 'field').slice(0, 50);
  let key = baseKey;
  let counter = 1;
  while (await prisma.formField.findFirst({ where: { formId, key } })) {
    counter += 1;
    key = `${baseKey}_${counter}`;
  }

  const mapsTo = validateMapsTo(input.mapsTo);

  const maxPos = await prisma.formField.aggregate({
    where: { formId },
    _max: { position: true },
  });
  const position = (maxPos._max.position ?? -1) + 1;

  const created = await prisma.formField.create({
    data: {
      organizationId,
      formId,
      key,
      label: input.label.trim(),
      type: input.type,
      required: Boolean(input.required),
      placeholder: input.placeholder?.trim() || null,
      helpText: input.helpText?.trim() || null,
      mapsTo,
      options:
        input.options && input.options.length
          ? (input.options as Prisma.InputJsonValue)
          : Prisma.DbNull,
      position,
    },
    select: { id: true },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'form.field.added',
    resourceType: 'form',
    resourceId: formId,
    diff: { after: { key, label: input.label, type: input.type } },
  });

  return created;
}

export async function deleteFormField(
  organizationId: string,
  actorUserId: string,
  formId: string,
  fieldId: string,
): Promise<void> {
  const field = await prisma.formField.findFirst({
    where: { id: fieldId, formId, organizationId },
    select: { id: true, key: true, label: true },
  });
  if (!field) throw new Error('Campo não encontrado');

  await prisma.formField.delete({ where: { id: fieldId } });

  await audit({
    organizationId,
    actorUserId,
    action: 'form.field.removed',
    resourceType: 'form',
    resourceId: formId,
    diff: { before: field },
  });
}

export async function moveFormField(
  organizationId: string,
  actorUserId: string,
  formId: string,
  fieldId: string,
  direction: 'up' | 'down',
): Promise<void> {
  const fields = await prisma.formField.findMany({
    where: { formId, organizationId },
    orderBy: { position: 'asc' },
    select: { id: true, position: true },
  });
  const idx = fields.findIndex((f) => f.id === fieldId);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= fields.length) return;

  const a = fields[idx];
  const b = fields[swapIdx];

  await prisma.$transaction([
    prisma.formField.update({ where: { id: a.id }, data: { position: b.position } }),
    prisma.formField.update({ where: { id: b.id }, data: { position: a.position } }),
  ]);

  await audit({
    organizationId,
    actorUserId,
    action: 'form.field.reordered',
    resourceType: 'form',
    resourceId: formId,
    diff: { after: { fieldId, direction } },
  });
}
