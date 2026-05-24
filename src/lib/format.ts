import type { TicketPriority, TicketStatus } from '@prisma/client';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'Novo',
  open: 'Aberto',
  in_progress: 'Em atendimento',
  pending_customer: 'Aguardando cliente',
  pending_third_party: 'Aguardando terceiro',
  resolved: 'Resolvido',
  closed: 'Fechado',
  cancelled: 'Cancelado',
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
  critical: 'Crítica',
};

// Paleta editorial — fundos suaves cream-friendly, foregrounds saturados o suficiente
// pra leitura mas que não competem com tipografia. Cores acompanham a paleta global.
export const STATUS_BADGE: Record<TicketStatus, { bg: string; fg: string; ring?: string }> = {
  new:                 { bg: '#e3ecf5', fg: '#1e3a5f' }, // info-soft
  open:                { bg: '#e8eaf2', fg: '#1c2541' }, // primary-soft
  in_progress:         { bg: '#faf0d8', fg: '#83580f' }, // warning-soft
  pending_customer:    { bg: '#efe7f5', fg: '#5b2a7a' },
  pending_third_party: { bg: '#fbe9ea', fg: '#9a2730' },
  resolved:            { bg: '#e3f1ea', fg: '#1d6d56' }, // success-soft
  closed:              { bg: '#ebe8df', fg: '#4a4c54' },
  cancelled:           { bg: '#f1ebe9', fg: '#7a4a4a' },
};

export const PRIORITY_BADGE: Record<TicketPriority, { bg: string; fg: string }> = {
  low:      { bg: '#ebe8df', fg: '#4a4c54' },
  normal:   { bg: '#e8eaf2', fg: '#1c2541' },
  high:     { bg: '#faf0d8', fg: '#83580f' },
  urgent:   { bg: '#fbe1d4', fg: '#a14310' },
  critical: { bg: '#fbe0e1', fg: '#9c1f24' },
};

export function formatRelativeShort(date: Date, now: Date = new Date()): string {
  const diff = Math.abs(now.getTime() - date.getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mes`;
  return `${Math.floor(months / 12)}a`;
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function maskDocument(doc: string | null | undefined): string {
  if (!doc) return '';
  const digits = doc.replace(/\D+/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return doc;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D+/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return phone;
}
