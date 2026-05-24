'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const COOKIE_NAME = 'sd-sidebar-collapsed';

export async function toggleSidebarAction() {
  const jar = await cookies();
  const current = jar.get(COOKIE_NAME)?.value === '1';
  jar.set(COOKIE_NAME, current ? '0' : '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  revalidatePath('/', 'layout');
}

export async function isSidebarCollapsed(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value === '1';
}
