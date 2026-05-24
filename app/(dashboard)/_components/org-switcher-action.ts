'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { unstable_update, auth } from '@/auth';

const Input = z.object({
  organizationId: z.string().uuid(),
});

export async function setActiveOrganizationAction(formData: FormData) {
  const parsed = Input.safeParse({ organizationId: formData.get('organizationId') });
  if (!parsed.success) return;

  const session = await auth();
  if (!session?.user) return;

  const match = session.user.memberships.find(
    (m) => m.organizationId === parsed.data.organizationId,
  );
  if (!match) return;

  // unstable_update reemite a sessão com o trigger="update" no callback jwt.
  // O objeto passado aqui é repassado como `session` no callback jwt — usamos cast porque
  // o nosso payload tem campos custom não declarados na interface Session base.
  await unstable_update({ activeOrganizationId: match.organizationId } as unknown as Parameters<typeof unstable_update>[0]);

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
