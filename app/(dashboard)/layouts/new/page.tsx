import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { NewLayoutForm } from './new-form';

export const metadata = { title: 'Novo layout — SmartDesk' };

export default async function NewLayoutPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'layouts:write');

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/layouts"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Painel Inteligente
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            Novo
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Novo painel inteligente
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Comece com um layout vazio. Os blocos — cards de cliente, alertas,
          dados enriquecidos — são adicionados no editor visual da próxima tela.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <NewLayoutForm />

        <aside className="flex flex-col gap-4" data-anim="reveal" data-delay="2">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">O que é</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Contexto sob medida ao lado do ticket
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              O Painel Inteligente é a coluna lateral que o atendente vê ao
              abrir um ticket. Você decide quais blocos aparecem e em que ordem
              — sem código.
            </p>
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Blocos disponíveis</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li>
                <span className="font-mono text-foreground">info_card</span> ·
                campos do ticket/cliente
              </li>
              <li>
                <span className="font-mono text-foreground">alert_list</span> ·
                avisos vindos das regras
              </li>
              <li>
                <span className="font-mono text-foreground">enrichment</span> ·
                dados de APIs externas via JSONPath
              </li>
              <li>
                <span className="font-mono text-foreground">links_list</span> ·
                atalhos pra sistemas internos
              </li>
              <li>
                <span className="font-mono text-foreground">html_block</span> ·
                conteúdo livre com{' '}
                <code className="rounded-sm bg-muted px-1">{'{{vars}}'}</code>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
