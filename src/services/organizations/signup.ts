import 'server-only';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

export type SignupInput = {
  userName: string;
  email: string;
  password: string;
  organizationName: string;
};

export class SignupConflictError extends Error {
  constructor(public field: 'email' | 'slug') {
    super(`${field}_taken`);
    this.name = 'SignupConflictError';
  }
}

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Signup público: cria User + Organization + OrganizationUser (owner) +
 * estrutura mínima (queue padrão "Suporte").
 *
 * Idempotência:
 *  - Email único: conflito → SignupConflictError('email').
 *  - Slug: se conflito, gera variante com sufixo aleatório.
 */
export async function signupOrganization(input: SignupInput): Promise<{
  userId: string;
  organizationId: string;
  organizationSlug: string;
}> {
  const email = input.email.trim().toLowerCase();
  const name = input.userName.trim();
  const orgName = input.organizationName.trim();

  if (!email || !name || !orgName || !input.password) {
    throw new Error('campos obrigatórios');
  }
  if (input.password.length < 8) throw new Error('senha muito curta (mín 8)');

  // Email já existe?
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) throw new SignupConflictError('email');

  let slug = slugify(orgName) || `org-${Date.now().toString(36).slice(-6)}`;
  const slugExists = await prisma.organization.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true },
  });
  if (slugExists) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        emailVerifiedAt: null, // confirmado via /verify-email/[token]
      },
      select: { id: true },
    });

    const org = await tx.organization.create({
      data: {
        name: orgName,
        slug,
        plan: 'trial',
      },
      select: { id: true, slug: true },
    });

    await tx.organizationUser.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: 'owner',
        joinedAt: new Date(),
      },
    });

    // Queue padrão
    await tx.queue.create({
      data: {
        organizationId: org.id,
        slug: 'suporte',
        name: 'Suporte',
        description: 'Fila padrão',
        isDefault: true,
      },
    });

    // SLA policy default
    await tx.slaPolicy.create({
      data: {
        organizationId: org.id,
        name: 'Default 8h/24h',
        description: 'Primeira resposta em 8h, resolução em 24h',
        appliesTo: { priorities: ['low', 'normal', 'high', 'urgent', 'critical'] } as Prisma.InputJsonObject,
        firstResponseMins: 8 * 60,
        resolutionMins: 24 * 60,
        timezone: 'America/Sao_Paulo',
      },
    });

    // Layout default mínimo
    await tx.ticketLayout.create({
      data: {
        organizationId: org.id,
        name: 'Layout padrão',
        scope: 'organization',
        isDefault: true,
        createdById: user.id,
        config: {
          blocks: [
            {
              id: 'blk_requester',
              type: 'info_card',
              title: 'Solicitante',
              fields: [
                { label: 'Nome', value: '{{ticket.requester.name}}', format: 'text' },
                { label: 'Email', value: '{{ticket.requester.email}}', format: 'email' },
                { label: 'Documento', value: '{{ticket.requester.document}}', format: 'document' },
              ],
            },
          ],
        } as Prisma.InputJsonObject,
      },
    });

    return { userId: user.id, organizationId: org.id, organizationSlug: org.slug };
  });

  await audit({
    organizationId: result.organizationId,
    actorUserId: result.userId,
    action: 'organization.signup',
    resourceType: 'organization',
    resourceId: result.organizationId,
    diff: { after: { name: orgName, slug: result.organizationSlug, ownerEmail: email } },
  });

  // Envia email de confirmação (não bloqueia signup se falhar)
  try {
    const { sendVerificationEmail } = await import('@/src/services/auth/email-verify');
    await sendVerificationEmail(result.userId);
  } catch {
    /* logger interno já cobriu */
  }

  return result;
}
