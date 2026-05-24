import 'server-only';
import bcrypt from 'bcryptjs';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

export class ProfileError extends Error {
  constructor(public code: 'bad_password' | 'not_found' | 'weak_password') {
    super(code);
    this.name = 'ProfileError';
  }
}

export async function updateProfile(
  userId: string,
  organizationId: string | null,
  input: { name?: string },
): Promise<void> {
  const data: { name?: string } = {};
  if (input.name) {
    const n = input.name.trim();
    if (n) data.name = n;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.user.update({ where: { id: userId }, data });
  await audit({
    organizationId,
    actorUserId: userId,
    action: 'user.profile_updated',
    resourceType: 'user',
    resourceId: userId,
    diff: { after: data },
  });
}

export async function changePassword(
  userId: string,
  organizationId: string | null,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  if (input.newPassword.length < 8) throw new ProfileError('weak_password');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user || !user.passwordHash) throw new ProfileError('not_found');

  const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!ok) throw new ProfileError('bad_password');

  const newHash = await bcrypt.hash(input.newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  await audit({
    organizationId,
    actorUserId: userId,
    action: 'user.password_changed',
    resourceType: 'user',
    resourceId: userId,
  });
}
