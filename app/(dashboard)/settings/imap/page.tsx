import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listConnections } from '@/src/services/imap/setup';
import { formatDateTime } from '@/src/lib/format';
import { NewImapConnectionForm } from './new-connection-form';
import {
  pauseConnectionAction,
  deleteConnectionAction,
  pollNowAction,
} from './actions';

export const metadata = { title: 'IMAP/SMTP — SmartDesk' };

export default async function ImapSettingsPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');

  const connections = await listConnections(ctx.organizationId);

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Configurações</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            IMAP / SMTP
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Caixas IMAP / SMTP
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Conecte qualquer servidor de email (Office 365, Zoho, iCloud, Mailcow,
          Postfix self-hosted, etc.). SmartDesk recebe mensagens via IMAP e
          responde via SMTP. Use isso quando OAuth do Gmail não for opção.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          <NewImapConnectionForm />

          <section className="card flex flex-col gap-4 p-5">
            <header className="flex items-baseline justify-between gap-3">
              <div>
                <p className="divider-eyebrow text-muted-foreground">
                  <span className="numeral-serif text-[0.6875rem] text-primary">02</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  Caixas conectadas
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Cada caixa é consultada a cada 1 minuto. Você pode forçar um
                  poll agora com o botão{' '}
                  <span className="font-medium text-foreground">⟳ Sincronizar</span>.
                </p>
              </div>
              <span className="numeral-serif text-2xl text-primary">{connections.length}</span>
            </header>

            {connections.length === 0 ? (
              <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Nenhuma caixa conectada ainda.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {connections.map((c) => (
                  <li
                    key={c.id}
                    className={`rounded-sm border p-3 transition-colors ${
                      c.status === 'active'
                        ? 'border-border bg-surface-raised'
                        : c.status === 'error'
                          ? 'border-destructive/30 bg-destructive-soft/30'
                          : 'border-border bg-muted/30 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <p className="font-medium text-foreground">{c.displayName}</p>
                          <span className="font-mono text-xs text-muted-foreground">·</span>
                          <code className="font-mono text-xs text-foreground-secondary">
                            {c.emailAddress}
                          </code>
                          {c.status === 'active' ? (
                            <span className="pill bg-success-soft text-success">● Ativa</span>
                          ) : c.status === 'error' ? (
                            <span className="pill bg-destructive-soft text-destructive">⚠ Erro</span>
                          ) : (
                            <span className="pill bg-muted text-muted-foreground">⏸ Pausada</span>
                          )}
                        </div>
                        <div className="mt-1.5 grid grid-cols-1 gap-1 text-[0.6875rem] text-muted-foreground sm:grid-cols-2">
                          <span>
                            IMAP{' '}
                            <code className="font-mono text-foreground-secondary">
                              {c.imapHost}:{c.imapPort}
                            </code>{' '}
                            <span className="rounded-sm bg-muted px-1 font-mono">
                              {c.imapSecurity}
                            </span>
                            {' · pasta '}
                            <code className="font-mono text-foreground-secondary">
                              {c.imapFolder}
                            </code>
                          </span>
                          <span>
                            SMTP{' '}
                            <code className="font-mono text-foreground-secondary">
                              {c.smtpHost}:{c.smtpPort}
                            </code>{' '}
                            <span className="rounded-sm bg-muted px-1 font-mono">
                              {c.smtpSecurity}
                            </span>
                            {c.smtpFromName ? ` · "${c.smtpFromName}"` : ''}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
                          {c.lastSyncedAt ? (
                            <span>sync {formatDateTime(c.lastSyncedAt)}</span>
                          ) : (
                            <span>nunca sincronizou</span>
                          )}
                        </div>
                        {c.lastError ? (
                          <p className="mt-2 rounded-sm border border-destructive/30 bg-destructive-soft px-2 py-1 text-[0.6875rem] text-destructive">
                            ⚠ {c.lastError.slice(0, 200)}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <form action={pollNowAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Forçar poll agora"
                          >
                            ⟳ Sincronizar
                          </button>
                        </form>
                        <form action={pauseConnectionAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <input
                            type="hidden"
                            name="paused"
                            value={c.status === 'active' ? 'true' : 'false'}
                          />
                          <button
                            type="submit"
                            className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {c.status === 'active' ? '⏸ Pausar' : '▶ Ativar'}
                          </button>
                        </form>
                        <DeleteForm id={c.id} email={c.emailAddress} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4" data-anim="reveal" data-delay="2">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">App Password</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Gmail / Office 365 com 2FA
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Se a conta tem 2FA habilitado, gere uma <strong>App Password</strong>{' '}
              específica em vez da sua senha normal:
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
              <li>
                · <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-primary hover:underline">Gmail App Passwords</a>
              </li>
              <li>
                · <a href="https://account.microsoft.com/security" target="_blank" rel="noreferrer" className="text-primary hover:underline">Microsoft App Passwords</a>
              </li>
              <li>
                · <a href="https://accounts.zoho.com/u/h#sessions/userpassword" target="_blank" rel="noreferrer" className="text-primary hover:underline">Zoho Application-Specific</a>
              </li>
            </ul>
          </div>

          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Como funciona</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Pipeline de email
            </h3>
            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
              <li>
                <span className="numeral-serif mr-1 text-primary">1.</span>
                Cron consulta IMAP a cada minuto (UID-based, busca só o novo)
              </li>
              <li>
                <span className="numeral-serif mr-1 text-primary">2.</span>
                Aplica filtros: auto-submitted, self-sent, dedup por Message-ID
              </li>
              <li>
                <span className="numeral-serif mr-1 text-primary">3.</span>
                Roteamento de email aplica (ignore/tag)
              </li>
              <li>
                <span className="numeral-serif mr-1 text-primary">4.</span>
                Cria ou anexa ao ticket (via In-Reply-To / Subject [HELP-N])
              </li>
              <li>
                <span className="numeral-serif mr-1 text-primary">5.</span>
                Regras de automação <code className="font-mono text-foreground">email_received</code> rodam
              </li>
              <li>
                <span className="numeral-serif mr-1 text-primary">6.</span>
                Resposta sai pelo SMTP da mesma conexão (mesmo From)
              </li>
            </ol>
          </div>

          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Segurança</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Senhas criptografadas
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Senhas IMAP/SMTP ficam guardadas com AES-256-GCM no banco (chave
              em <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem]">ENCRYPTION_KEY_BASE64</code>).
              Nunca aparecem em logs nem no audit.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function DeleteForm({ id }: { id: string; email: string }) {
  return (
    <form action={deleteConnectionAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-sm border border-border bg-surface px-2 py-1 text-[0.6875rem] text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
        title="Desconectar caixa"
      >
        ✕
      </button>
    </form>
  );
}
