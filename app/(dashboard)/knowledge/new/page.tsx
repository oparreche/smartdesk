import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { ArticleEditor } from '../article-editor';

export const metadata = { title: 'Novo artigo — SmartDesk' };

export default async function NewArticlePage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/knowledge" className="text-muted-foreground hover:text-foreground hover:underline">
            Knowledge
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">Novo</span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Novo artigo
        </h1>
      </header>

      <ArticleEditor mode="create" />
    </div>
  );
}
