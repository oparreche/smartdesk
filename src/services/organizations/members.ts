import 'server-only';
import { prisma } from '@/src/lib/prisma';

export async function listAssignableMembers(organizationId: string) {
  const rows = await prisma.organizationUser.findMany({
    where: {
      organizationId,
      status: 'active',
      role: { in: ['owner', 'admin', 'supervisor', 'agent'] },
    },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true, deletedAt: true } },
    },
  });
  return rows
    .filter((r) => !r.user.deletedAt)
    .map((r) => ({ id: r.user.id, name: r.user.name, email: r.user.email, role: r.role }));
}
