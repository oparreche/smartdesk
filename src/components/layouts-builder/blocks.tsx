import type {
  RenderableBlock,
  RenderableInfoCard,
  RenderableMetric,
  RenderableTable,
  RenderableAlert,
  RenderableActionButton,
} from '@/src/services/layouts/render-prepare';

const ALERT_VARIANT: Record<RenderableAlert['variant'], { bg: string; border: string; fg: string }> = {
  info: { bg: '#dbeafe', border: '#93c5fd', fg: '#1e40af' },
  success: { bg: '#dcfce7', border: '#86efac', fg: '#166534' },
  warning: { bg: '#fef3c7', border: '#fcd34d', fg: '#92400e' },
  destructive: { bg: '#fee2e2', border: '#fca5a5', fg: '#991b1b' },
};

const BUTTON_VARIANT: Record<RenderableActionButton['variant'], string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-muted text-foreground hover:bg-muted/80',
  outline: 'border border-border bg-background hover:bg-muted',
};

export function BlockRenderer({ block }: { block: RenderableBlock }) {
  const wrapperClass = block.visible
    ? ''
    : 'opacity-40 line-through pointer-events-none';

  return (
    <div className={wrapperClass}>
      {block.type === 'info_card' ? <InfoCardBlock block={block} /> : null}
      {block.type === 'metric' ? <MetricBlock block={block} /> : null}
      {block.type === 'table' ? <TableBlock block={block} /> : null}
      {block.type === 'alert' ? <AlertBlock block={block} /> : null}
      {block.type === 'action_button' ? <ActionButtonBlock block={block} /> : null}
    </div>
  );
}

function InfoCardBlock({ block }: { block: RenderableInfoCard }) {
  return (
    <section className="rounded-md border border-border bg-background p-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {block.title}
      </h3>
      <dl className="space-y-1.5 text-sm">
        {block.fields.map((f, idx) => (
          <div key={idx} className="grid grid-cols-[100px_1fr] gap-2">
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="break-words">
              {f.badgeColor ? (
                <span
                  className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${f.badgeColor}22`, color: f.badgeColor }}
                >
                  {f.value || '—'}
                </span>
              ) : (
                <span>{f.value || <span className="text-muted-foreground">—</span>}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function MetricBlock({ block }: { block: RenderableMetric }) {
  return (
    <section className="rounded-md border border-border bg-background p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{block.title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{block.value || '—'}</p>
      {block.trend ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {block.trend.label ? `${block.trend.label} · ` : ''}
          {block.trend.value}
        </p>
      ) : null}
    </section>
  );
}

function TableBlock({ block }: { block: RenderableTable }) {
  return (
    <section className="rounded-md border border-border bg-background p-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {block.title}
      </h3>
      {block.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{block.emptyMessage ?? 'Sem dados.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left">
              <tr>
                {block.columnLabels.map((l) => (
                  <th key={l} className="px-2 py-1 font-medium">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, ri) => (
                <tr key={ri} className="border-t border-border">
                  {r.cells.map((c, ci) => (
                    <td key={ci} className="px-2 py-1 align-top">{c.value || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AlertBlock({ block }: { block: RenderableAlert }) {
  const v = ALERT_VARIANT[block.variant];
  return (
    <div
      className="rounded-md border px-3 py-2 text-sm"
      style={{ backgroundColor: v.bg, borderColor: v.border, color: v.fg }}
      role="alert"
    >
      {block.icon ? <span className="mr-1">{block.icon}</span> : null}
      {block.message}
    </div>
  );
}

function ActionButtonBlock({ block }: { block: RenderableActionButton }) {
  return (
    <a
      href={block.url}
      target={block.openIn === 'new_tab' ? '_blank' : undefined}
      rel={block.openIn === 'new_tab' ? 'noopener noreferrer' : undefined}
      className={`block w-full rounded-md px-3 py-2 text-center text-sm font-medium transition-colors ${BUTTON_VARIANT[block.variant]}`}
    >
      {block.label}
    </a>
  );
}
