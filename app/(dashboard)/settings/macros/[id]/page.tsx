import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { z } from 'zod';
import { ActionSchema, type Action } from '@/src/services/rules/schema';
import { MacroEditor } from '../macro-editor';
import { deleteMacroAction } from '../actions';

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return { title: `Macro ${id.slice(0, 6)} — SmartDesk` };
}

export default async function MacroEditPage(props: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');
  const { id } = await props.params;

  const macro = await prisma.macro.findFirst({
    where: { id, organizationId: ctx.organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      shortcut: true,
      body: true,
      enabled: true,
      actions: true,
    },
  });
  if (!macro) notFound();

  const actionsParsed = z.array(ActionSchema).max(10).safeParse(macro.actions);
  const actions: Action[] = actionsParsed.success ? actionsParsed.data : [];

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/settings/macros" className="text-muted-foreground hover:text-foreground hover:underline">
            Macros
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            {macro.id.slice(0, 6)}
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          {macro.name}
        </h1>
      </header>

      <MacroEditor
        mode="edit"
        id={macro.id}
        initial={{
          name: macro.name,
          shortcut: macro.shortcut,
          body: macro.body,
          enabled: macro.enabled,
          actions,
        }}
      />

      <section className="rounded-md border border-destructive/30 bg-destructive-soft/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="divider-eyebrow text-destructive">Zona de perigo</p>
            <h3 className="mt-1 font-display text-base font-medium tracking-tight">
              Excluir macro
            </h3>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              A macro some do picker imediatamente. Histórico de uso é preservado em auditoria.
            </p>
          </div>
          <form action={deleteMacroAction}>
            <input type="hidden" name="id" value={macro.id} />
            <input type="hidden" name="redirect" value="1" />
            <button
              type="submit"
              className="shrink-0 rounded-sm border border-destructive/30 bg-surface-raised px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive-soft"
            >
              Excluir
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
