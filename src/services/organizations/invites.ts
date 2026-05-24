import 'server-only';
import bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma, type OrgRole } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { env } from '@/src/lib/env';
import { audit } from '@/src/services/audit/log';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitePayload = {
  organizationId: string;
  email: string;
  role: OrgRole;
  invitedById: string;
  expiresAt: number;
  nonce: string;
};

function hmac(payload: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
}

export function createInviteToken(input: { organizationId: string; email: string; role: OrgRole; invitedById: string }): string {
  const payload: InvitePayload = {
    organizationId: input.organizationId,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    invitedById: input.invitedById,
    expiresAt: Date.now() + INVITE_TTL_MS,
    nonce: Math.random().toString(36).slice(2),
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export function decodeInviteToken(token: string): InvitePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = hmac(body);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as InvitePayload;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export class InviteError extends Error {
  constructor(public code: 'invalid' | 'org_not_found' | 'already_member' | 'user_exists_different_email') {
    super(code);
    this.name = 'InviteError';
  }
}

/**
 * Cria convite e retorna URL pronta. Não persiste em nenhuma tabela (token é
 * self-contained HMAC-assinado). Persistir vira tabela na Fase 9+ se precisarmos
 * revogar.
 */
export async function inviteMember(input: {
  organizationId: string;
  actorUserId: string;
  email: string;
  role: OrgRole;
}): Promise<{ token: string; inviteUrl: string }> {
  const email = input.email.trim().toLowerCase();

  const org = await prisma.organization.findFirst({
    where: { id: input.organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!org) throw new InviteError('org_not_found');

  // Já é membro?
  const existing = await prisma.organizationUser.findFirst({
    where: {
      organizationId: input.organizationId,
      user: { email },
    },
    select: { id: true },
  });
  if (existing) throw new InviteError('already_member');

  const token = createInviteToken({
    organizationId: input.organizationId,
    email,
    role: input.role,
    invitedById: input.actorUserId,
  });

  const inviteUrl = `${env.APP_URL}/accept-invite/${token}`;

  await audit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: 'invite.created',
    resourceType: 'organization',
    resourceId: input.organizationId,
    diff: { after: { email, role: input.role } },
  });

  return { token, inviteUrl };
}

/**
 * Aceita um convite. Se usuário com mesmo email já existe:
 *  - Verifica senha existente (pedida no form do accept-invite)
 *  - Adiciona membership na nova org
 * Se não existe:
 *  - Cria User com password fornecido
 *  - Cria membership
 */
export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
}): Promise<{ userId: string; organizationId: string }> {
  const payload = decodeInviteToken(input.token);
  if (!payload) throw new InviteError('invalid');

  const org = await prisma.organization.findFirst({
    where: { id: payload.organizationId, deletedAt: null, status: 'active' },
    select: { id: true, name: true },
  });
  if (!org) throw new InviteError('org_not_found');

  const passwordHash = await bcrypt.hash(input.password, 10);

  // Existe user com este email?
  const existingUser = await prisma.user.findUnique({
    where: { email: payload.email },
    select: { id: true, passwordHash: true },
  });

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    // Verifica se já é membro (caso convite fosse repetido)
    const isMember = await prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId } },
      select: { id: true },
    });
    if (isMember) throw new InviteError('already_member');

    // Senha existente NÃO é alterada — quem aceita usa a senha que já tem
    await prisma.organizationUser.create({
      data: {
        organizationId: org.id,
        userId,
        role: payload.role,
        invitedById: payload.invitedById,
        invitedAt: new Date(payload.expiresAt - INVITE_TTL_MS),
        joinedAt: new Date(),
      },
    });
  } else {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: payload.email,
          name: input.name.trim() || payload.email,
          passwordHash,
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      });
      await tx.organizationUser.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: payload.role,
          invitedById: payload.invitedById,
          invitedAt: new Date(payload.expiresAt - INVITE_TTL_MS),
          joinedAt: new Date(),
        },
      });
      return user.id;
    });
    userId = result;
  }

  await audit({
    organizationId: org.id,
    actorUserId: userId,
    action: 'invite.accepted',
    resourceType: 'organization',
    resourceId: org.id,
    diff: { after: { email: payload.email, role: payload.role } },
  });

  return { userId, organizationId: org.id };
}

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: Date | null;
  invitedAt: Date | null;
  status: 'invited' | 'active' | 'suspended';
};

export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  const rows = await prisma.organizationUser.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ joinedAt: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.user.name,
    email: r.user.email,
    role: r.role,
    joinedAt: r.joinedAt,
    invitedAt: r.invitedAt,
    status: r.status,
  }));
}

export async function changeMemberRole(
  organizationId: string,
  actorUserId: string,
  membershipId: string,
  newRole: OrgRole,
): Promise<void> {
  const existing = await prisma.organizationUser.findFirst({
    where: { id: membershipId, organizationId },
    select: { id: true, role: true, userId: true, user: { select: { email: true } } },
  });
  if (!existing) throw new Error('Membro não encontrado');

  // Não permitir downgrade do último owner
  if (existing.role === 'owner' && newRole !== 'owner') {
    const otherOwners = await prisma.organizationUser.count({
      where: { organizationId, role: 'owner', status: 'active', NOT: { id: membershipId } },
    });
    if (otherOwners === 0) throw new Error('Não é possível remover o último owner');
  }

  await prisma.organizationUser.update({ where: { id: membershipId }, data: { role: newRole } });

  await audit({
    organizationId,
    actorUserId,
    action: 'member.role_changed',
    resourceType: 'organization_user',
    resourceId: membershipId,
    diff: { before: { role: existing.role }, after: { role: newRole } },
  });
}

export async function removeMember(
  organizationId: string,
  actorUserId: string,
  membershipId: string,
): Promise<void> {
  const existing = await prisma.organizationUser.findFirst({
    where: { id: membershipId, organizationId },
    select: { id: true, role: true, userId: true, user: { select: { email: true } } },
  });
  if (!existing) throw new Error('Membro não encontrado');

  if (existing.role === 'owner') {
    const otherOwners = await prisma.organizationUser.count({
      where: { organizationId, role: 'owner', status: 'active', NOT: { id: membershipId } },
    });
    if (otherOwners === 0) throw new Error('Não é possível remover o último owner');
  }

  // Soft: marca como suspended (preserva referências em tickets/audit)
  await prisma.organizationUser.update({
    where: { id: membershipId },
    data: { status: 'suspended' as Prisma.OrganizationUserUpdateInput['status'] },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'member.removed',
    resourceType: 'organization_user',
    resourceId: membershipId,
    diff: { before: { email: existing.user.email, role: existing.role } },
  });
}
