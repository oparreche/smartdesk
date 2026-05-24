import 'server-only';
import { auth, type SessionUserMembership } from '@/auth';
import type { OrgRole } from '@prisma/client';

export class UnauthorizedError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class NoActiveOrganizationError extends Error {
  constructor(message = 'No active organization selected') {
    super(message);
    this.name = 'NoActiveOrganizationError';
  }
}

export type OrgContext = {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  role: OrgRole;
  memberships: SessionUserMembership[];
};

/**
 * Carrega o contexto da organização ativa. Use em server actions e route handlers
 * que exigem sessão + organização escolhida.
 *
 * Lança UnauthorizedError ou NoActiveOrganizationError. Não trate dentro da
 * função — deixe propagar para o handler/wrapper traduzir em 401/403.
 */
export async function getOrgContext(): Promise<OrgContext> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new UnauthorizedError();
  }

  const activeId = session.user.activeOrganizationId;
  const role = session.user.activeRole;
  if (!activeId || !role) {
    throw new NoActiveOrganizationError();
  }

  const membership = session.user.memberships.find((m) => m.organizationId === activeId);
  if (!membership) {
    throw new NoActiveOrganizationError('Active organization not in memberships');
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name ?? session.user.email,
    organizationId: membership.organizationId,
    organizationSlug: membership.organizationSlug,
    organizationName: membership.organizationName,
    role: membership.role,
    memberships: session.user.memberships,
  };
}

/**
 * Versão que retorna null em vez de lançar. Para páginas que precisam decidir
 * o que renderizar conforme estado de auth (login vs dashboard).
 */
export async function getOrgContextOrNull(): Promise<OrgContext | null> {
  try {
    return await getOrgContext();
  } catch {
    return null;
  }
}
