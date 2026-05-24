import 'server-only';
import { prisma } from '@/src/lib/prisma';

export type RequesterInput = {
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  name?: string | null;
  externalId?: string | null;
};

function normalizeDocument(doc: string | null | undefined): string | null {
  if (!doc) return null;
  return doc.replace(/\D+/g, '');
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

/**
 * Localiza um Requester por email/document/externalId; cria se não existir.
 *
 * Matching:
 *  1. externalId (mais confiável)
 *  2. email
 *  3. document (digits-only)
 *
 * Em todos os casos, atualiza campos vazios com o que veio (não sobrescreve).
 */
export async function findOrCreateRequester(
  organizationId: string,
  input: RequesterInput,
): Promise<{ id: string; created: boolean }> {
  const email = normalizeEmail(input.email);
  const document = normalizeDocument(input.document);
  const externalId = input.externalId?.trim() || null;
  const normalizedPhone = input.phone ? input.phone.replace(/\D+/g, '') || null : null;

  if (!email && !document && !externalId && !normalizedPhone) {
    // Cria anonimamente (nem dá pra deduplicar — só nome)
    const created = await prisma.requester.create({
      data: {
        organizationId,
        name: input.name?.trim() ?? null,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  }

  let existing: { id: string; email: string | null; document: string | null; name: string | null; phone: string | null; externalId: string | null } | null = null;

  if (externalId) {
    existing = await prisma.requester.findFirst({
      where: { organizationId, externalId, deletedAt: null },
      select: { id: true, email: true, document: true, name: true, phone: true, externalId: true },
    });
  }
  if (!existing && email) {
    existing = await prisma.requester.findFirst({
      where: { organizationId, email, deletedAt: null },
      select: { id: true, email: true, document: true, name: true, phone: true, externalId: true },
    });
  }
  if (!existing && document) {
    existing = await prisma.requester.findFirst({
      where: { organizationId, document, deletedAt: null },
      select: { id: true, email: true, document: true, name: true, phone: true, externalId: true },
    });
  }
  if (!existing && normalizedPhone) {
    existing = await prisma.requester.findFirst({
      where: { organizationId, phone: normalizedPhone, deletedAt: null },
      select: { id: true, email: true, document: true, name: true, phone: true, externalId: true },
    });
  }

  if (existing) {
    const data: Record<string, string | null> = {};
    if (!existing.email && email) data.email = email;
    if (!existing.document && document) data.document = document;
    if (!existing.externalId && externalId) data.externalId = externalId;
    if (!existing.name && input.name) data.name = input.name.trim();
    if (!existing.phone && input.phone) data.phone = input.phone.replace(/\D+/g, '') || null;

    if (Object.keys(data).length > 0) {
      await prisma.requester.update({ where: { id: existing.id }, data });
    }
    return { id: existing.id, created: false };
  }

  const created = await prisma.requester.create({
    data: {
      organizationId,
      email,
      document,
      externalId,
      name: input.name?.trim() ?? null,
      phone: input.phone?.trim() ?? null,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}
