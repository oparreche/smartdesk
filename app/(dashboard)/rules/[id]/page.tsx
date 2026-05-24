import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { getRule } from '@/src/services/rules/crud';
import { RuleDefinitionSchema, ActionSchema, type Action } from '@/src/services/rules/schema';
import { ConditionSchema, type Condition } from '@/src/services/layouts/schema';
import { RuleEditor } from './rule-editor';
import { DangerZone } from './danger-zone';

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return { title: `Regra ${id.slice(0, 6)} — SmartDesk` };
}

export default async function RuleEditPage(props: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');
  const { id } = await props.params;

  const rule = await getRule(ctx.organizationId, id);
  if (!rule) notFound();

  let conditions: Condition | undefined;
  if (rule.conditions) {
    const r = ConditionSchema.safeParse(rule.conditions);
    if (r.success) conditions = r.data;
  }
  const actionsParsed = Array.isArray(rule.actions)
    ? (rule.actions as unknown[])
        .map((a) => {
          const r = ActionSchema.safeParse(a);
          return r.success ? r.data : null;
        })
        .filter((a): a is Action => a !== null)
    : [];

  const initial = RuleDefinitionSchema.parse({
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.trigger,
    conditions,
    actions: actionsParsed.length ? actionsParsed : [{ type: 'add_tag', value: 'auto' }],
    runOrder: rule.runOrder,
    stopAfterMatch: rule.stopAfterMatch,
  });

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8 pb-32">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/rules" className="text-muted-foreground hover:text-foreground hover:underline">
            Regras
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            {rule.id.slice(0, 6)}
          </span>
          <span
            className={`pill ${
              rule.enabled
                ? 'bg-success-soft text-success'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {rule.enabled ? 'Ativa' : 'Inativa'}
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          {rule.name}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Edite gatilho, condições e ações. Use{' '}
          <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem]">
            {'{{partner.type}}'}
          </code>{' '}
          e similares como referência a campos do ticket.
        </p>
      </header>

      <RuleEditor id={rule.id} initial={initial} />

      <DangerZone ruleId={rule.id} ruleName={rule.name} />
    </div>
  );
}
