import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listMembers } from '@/src/services/organizations/invites';
import { formatDateTime } from '@/src/lib/format';
import { InviteForm } from './invite-form';
import { RoleSelect } from './role-select';
import { removeMemberAction } from './actions';

export const metadata = { title: 'Usuários — SmartDesk' };

const STATUS_LABEL: Record<string, string> = {
  invited: 'Convidado',
  active: 'Ativo',
  suspended: 'Removido',
};

export default async function UsersPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'users:manage');

  const members = await listMembers(ctx.organizationId);

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="border-b border-border pb-6">
        <p className="divider-eyebrow text-muted-foreground">Configurações</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Usuários</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Gerencie quem tem acesso à organização.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="divider-eyebrow">Convidar</h2>
        <InviteForm />
      </section>

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome / Email</th>
              <th className="px-4 py-3 font-medium">Papel</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Entrou em</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.userId === ctx.userId;
              const initials = m.name.split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('');
              return (
                <tr key={m.id} className="border-t border-border-subtle align-middle hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-raised text-[0.6875rem] font-medium text-foreground-secondary">
                        {initials || '?'}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleSelect
                      id={m.id}
                      role={m.role}
                      disabled={m.status !== 'active' || (isSelf && m.role === 'owner')}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="pill" style={
                      m.status === 'active' ? { backgroundColor: '#e3f1ea', color: '#1d6d56' }
                      : m.status === 'invited' ? { backgroundColor: '#faf0d8', color: '#83580f' }
                      : { backgroundColor: '#ebe8df', color: '#4a4c54' }
                    }>
                      {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {m.joinedAt ? formatDateTime(m.joinedAt) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.status === 'active' && !isSelf ? (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          type="submit"
                          className="rounded-sm border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                        >
                          Remover
                        </button>
                      </form>
                    ) : isSelf ? (
                      <span className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">você</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
