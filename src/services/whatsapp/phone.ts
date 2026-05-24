import 'server-only';

/**
 * Normaliza um telefone para o formato esperado pela WhatsApp Cloud API:
 * apenas dígitos, com country code (sem +).
 *
 * Exemplos:
 *   "+55 (11) 98888-7777"  → "5511988887777"
 *   "11988887777"          → "11988887777" (não adiciona country code; assume já está)
 *   "5511988887777"        → "5511988887777"
 */
export function normalizePhoneE164(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\D+/g, '');
}

/**
 * Display amigável: "+55 11 98888-7777"
 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  const d = normalizePhoneE164(raw);
  if (!d) return '';
  // BR formats
  if (d.startsWith('55') && d.length === 13) {
    return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.startsWith('55') && d.length === 12) {
    return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return `+${d}`;
}
