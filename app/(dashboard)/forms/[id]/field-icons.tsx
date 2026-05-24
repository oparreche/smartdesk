/**
 * Ícones tipográficos curtos para cada tipo de campo do form.
 * Usa caracteres unicode renderizados em font mono pra consistência.
 */

const STROKE = {
  width: 1.5,
  linecap: 'round' as const,
  linejoin: 'round' as const,
  fill: 'none',
};

export function FieldIcon({ type, className }: { type: string; className?: string }) {
  const common = { ...STROKE, stroke: 'currentColor', className } as const;
  switch (type) {
    case 'text':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M3 5h10" />
          <path d="M3 9h7" />
          <path d="M3 13h5" />
        </svg>
      );
    case 'textarea':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="2.5" y="3" width="11" height="10" />
          <path d="M5 6h6" />
          <path d="M5 9h6" />
          <path d="M5 12h4" />
        </svg>
      );
    case 'email':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="2" y="4" width="12" height="8" />
          <path d="M2 4.5l6 4 6-4" />
        </svg>
      );
    case 'phone':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M4 2.5l2 2-1 2c.6 1.5 1.8 2.7 3.3 3.3l2-1 2 2-1 1.5c-3.5 0-7-3.5-7-7z" />
        </svg>
      );
    case 'document':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M9 2H4v12h8V5z" />
          <path d="M9 2v3h3" />
          <path d="M6 9h4" />
        </svg>
      );
    case 'number':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M5 3l-1 10" />
          <path d="M11 3l-1 10" />
          <path d="M3 7h11" />
          <path d="M2 10h11" />
        </svg>
      );
    case 'currency':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M11 4.5c-.7-.7-1.7-1-3-1-2 0-3 1-3 2.3 0 1.4 1 2.2 3 2.5s3 1.1 3 2.5c0 1.3-1 2.3-3 2.3-1.3 0-2.3-.3-3-1" />
          <path d="M8 2v12" />
        </svg>
      );
    case 'date':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="2.5" y="4" width="11" height="9" />
          <path d="M2.5 7h11" />
          <path d="M5 3v2" />
          <path d="M11 3v2" />
        </svg>
      );
    case 'select':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="2.5" y="5" width="11" height="6" />
          <path d="M10 7l1 1 1-1" />
        </svg>
      );
    case 'multiselect':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="2" y="3" width="11" height="4" />
          <rect x="2" y="9" width="11" height="4" />
          <path d="M10 4.5l.7.7 1.3-1.3" />
        </svg>
      );
    case 'checkbox':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <rect x="3" y="3" width="10" height="10" rx="1.5" />
          <path d="M6 8.5l1.5 1.5 3-3.5" />
        </svg>
      );
    case 'url':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M9 5h2a3 3 0 1 1 0 6h-2" />
          <path d="M7 11H5a3 3 0 1 1 0-6h2" />
          <path d="M6 8h4" />
        </svg>
      );
    case 'hidden':
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <path d="M2 2l12 12" />
          <path d="M3 8c1.5-3 4-4.5 6.5-3.8" />
          <path d="M13 8c-1 2-3 3.5-5 3.9" />
          <circle cx="8" cy="8" r="1.5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" {...common}>
          <circle cx="8" cy="8" r="5" />
        </svg>
      );
  }
}
