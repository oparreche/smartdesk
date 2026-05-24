import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

export async function updateOrganization(
  organizationId: string,
  actorUserId: string,
  input: { name?: string },
): Promise<void> {
  const data: { name?: string } = {};
  if (input.name) {
    const n = input.name.trim();
    if (n) data.name = n;
  }
  if (Object.keys(data).length === 0) return;

  const before = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  await prisma.organization.update({ where: { id: organizationId }, data });

  await audit({
    organizationId,
    actorUserId,
    action: 'organization.updated',
    resourceType: 'organization',
    resourceId: organizationId,
    diff: { before, after: data },
  });
}
