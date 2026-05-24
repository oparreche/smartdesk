import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Valida o header `X-Hub-Signature-256` enviado pelo Meta para o webhook.
 * Formato: `sha256=<hex>`. Computamos HMAC-SHA256(appSecret, rawBody) e
 * comparamos em tempo constante.
 *
 * Se o admin não configurou `appSecret`, fazemos fallback para o verifyToken
 * via path param — menos seguro, mas evita bloquear conexões de teste.
 */
export function verifyWhatsappSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
}): boolean {
  if (!input.signatureHeader) return false;
  const [scheme, sig] = input.signatureHeader.split('=');
  if (scheme !== 'sha256' || !sig) return false;

  const expected = createHmac('sha256', input.appSecret).update(input.rawBody, 'utf8').digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
