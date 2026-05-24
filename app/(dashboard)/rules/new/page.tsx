import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { NewRuleForm } from './new-form';

export const metadata = { title: 'Nova regra — SmartDesk' };

export default async function NewRulePage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/rules" className="text-muted-foreground hover:text-foreground hover:underline">
            Regras
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">Nova</span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Nova regra de automação
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Comece com o básico — escolha o gatilho e dê um nome. Você refina condições e ações na próxima tela.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <NewRuleForm />

        <aside className="flex flex-col gap-4" data-anim="reveal" data-delay="2">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Como funciona</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Gatilho → Condição → Ação
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Toda vez que o gatilho disparar, o SmartDesk avalia as condições e executa as ações configuradas — em ordem.
            </p>
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Exemplo</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Parceiro premium → prioridade alta
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li>
                <span className="font-mono text-foreground">trigger</span> · ticket enriquecido
              </li>
              <li>
                <span className="font-mono text-foreground">if</span> · partner.tier eq <code className="rounded-sm bg-muted px-1">premium</code>
              </li>
              <li>
                <span className="font-mono text-foreground">then</span> · set_priority high + add_tag VIP
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
