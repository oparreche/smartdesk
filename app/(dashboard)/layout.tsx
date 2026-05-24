import { redirect } from 'next/navigation';
import { getOrgContextOrNull } from '@/src/lib/tenant';
import { prisma } from '@/src/lib/prisma';
import { Sidebar } from './_components/sidebar';
import { DashboardHeader } from './_components/header';
import { VerifyEmailBanner } from './_components/verify-banner';
import { KeyboardShortcuts } from './_components/keyboard-shortcuts';
import { isSidebarCollapsed } from './_components/sidebar-action';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContextOrNull();
  if (!ctx) redirect('/login');

  const [collapsed, user] = await Promise.all([
    isSidebarCollapsed(),
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true, emailVerifiedAt: true },
    }),
  ]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar role={ctx.role} collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader ctx={ctx} />
        {user && !user.emailVerifiedAt ? <VerifyEmailBanner email={user.email} /> : null}
        <main className="flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
      <KeyboardShortcuts />
    </div>
  );
}
