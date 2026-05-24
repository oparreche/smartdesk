import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { NewFormForm } from './new-form';

export const metadata = { title: 'Novo formulário — SmartDesk' };

export default async function NewFormPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'forms:write');

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/forms" className="text-muted-foreground hover:text-foreground hover:underline">
            Formulários
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">Novo</span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Novo formulário público
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Comece com a estrutura mínima — nome e descrição. Vamos gerar 4
          campos padrão que você pode editar a seguir.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <NewFormForm />

        <aside className="flex flex-col gap-4" data-anim="reveal" data-delay="2">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">O que é</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Página pública pra abertura de chamado
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Cada formulário gera uma URL pública pra cliente abrir ticket sem
              fazer login. Você define os campos, valida no envio e tudo cai na
              fila configurada.
            </p>
          </div>
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Campos default</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li><span className="font-mono text-foreground">name</span> · texto curto, obrigatório</li>
              <li><span className="font-mono text-foreground">email</span> · email, obrigatório</li>
              <li><span className="font-mono text-foreground">subject</span> · texto curto, obrigatório</li>
              <li><span className="font-mono text-foreground">message</span> · textarea, obrigatório</li>
            </ul>
            <p className="mt-3 text-[0.6875rem] text-muted-foreground">
              Adicione select, número, telefone, documento, anexos e validações
              no editor.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
