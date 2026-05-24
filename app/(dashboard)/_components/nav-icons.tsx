/**
 * Ícones SVG da sidebar. Stroke-only, 16x16, herdam currentColor.
 * Mantidos inline pra evitar dependência de bib externa.
 */

export type IconName =
  | 'dashboard'
  | 'tickets'
  | 'integrations'
  | 'layouts'
  | 'forms'
  | 'rules'
  | 'users'
  | 'gmail'
  | 'whatsapp'
  | 'queues'
  | 'tags'
  | 'audit'
  | 'lgpd'
  | 'organization';

const STROKE = {
  width: 1.5,
  linecap: 'round' as const,
  linejoin: 'round' as const,
  fill: 'none',
};

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const common = { ...STROKE, stroke: 'currentColor', className } as const;
  switch (name) {
    case 'dashboard':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="2" y="2" width="5" height="5" />
          <rect x="9" y="2" width="5" height="5" />
          <rect x="2" y="9" width="5" height="5" />
          <rect x="9" y="9" width="5" height="5" />
        </svg>
      );
    case 'tickets':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M2 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1.5 1.5 0 0 0 0 3v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1.5 1.5 0 0 0 0-3z" />
          <path d="M6 4v8" strokeDasharray="1.5 1.5" />
        </svg>
      );
    case 'integrations':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <circle cx="4" cy="4" r="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 4h4a2 2 0 0 1 2 2v4" />
        </svg>
      );
    case 'layouts':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="2" y="2" width="12" height="12" />
          <path d="M2 6h12" />
          <path d="M9 6v8" />
        </svg>
      );
    case 'forms':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="2" y="2" width="12" height="12" />
          <path d="M5 6h6" />
          <path d="M5 9h6" />
          <path d="M5 12h4" />
        </svg>
      );
    case 'rules':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <circle cx="4" cy="4" r="2" />
          <path d="M6 4h4a2 2 0 0 1 2 2v2" />
          <path d="M10 12l2 2 2-3" />
        </svg>
      );
    case 'users':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <circle cx="6" cy="5" r="2.5" />
          <path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" />
          <circle cx="11" cy="5.5" r="2" />
          <path d="M11 9c1.7 0 3 1.3 3 3" />
        </svg>
      );
    case 'gmail':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="2" y="3" width="12" height="10" />
          <path d="M2 4l6 5 6-5" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M2.5 13.5l1-3a6 6 0 1 1 2 2z" />
          <path d="M6 7c.4 1.4 1.6 2.6 3 3" />
        </svg>
      );
    case 'queues':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M3 4h10" />
          <path d="M3 8h10" />
          <path d="M3 12h10" />
        </svg>
      );
    case 'tags':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M8.5 2H3a1 1 0 0 0-1 1v5.5L9 15l5-5z" />
          <circle cx="5.5" cy="5.5" r="1" />
        </svg>
      );
    case 'audit':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4v4l3 2" />
        </svg>
      );
    case 'lgpd':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M8 2l6 2v4c0 3.5-2.5 5.5-6 6-3.5-.5-6-2.5-6-6V4z" />
          <path d="M5.5 8l2 2 3.5-4" />
        </svg>
      );
    case 'organization':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="3" y="3" width="10" height="10" />
          <path d="M6 13V8h4v5" />
          <path d="M6 6h.01" />
          <path d="M10 6h.01" />
        </svg>
      );
  }
}
