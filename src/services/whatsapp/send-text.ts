import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { decryptAccessToken } from '@/src/services/whatsapp/setup';
import { normalizePhoneE164 } from '@/src/services/whatsapp/phone';

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Envia uma mensagem de texto livre via WhatsApp Cloud API.
 * Só funciona dentro da janela de 24h após a última mensagem do cliente
 * (fora dessa janela só templates aprovados).
 */
export async function sendWhatsappText(
  connectionId: string,
  toPhone: string,
  text: string,
): Promise<{ waMessageId: string } | { error: string }> {
  const conn = await prisma.whatsappConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, phoneNumberId: true, status: true, deletedAt: true },
  });
  if (!conn || conn.deletedAt || conn.status !== 'active') {
    return { error: 'Connection inactive' };
  }
  const phone = normalizePhoneE164(toPhone);
  if (!phone) return { error: 'Invalid phone' };

  const token = await decryptAccessToken(conn.id);
  try {
    const res = await fetch(`${META_GRAPH_BASE}/${conn.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/^\+/, ''),
        type: 'text',
        text: { body: text.slice(0, 4096) },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };
    if (!res.ok || !json.messages?.[0]?.id) {
      const err = json.error?.message ?? `Meta API ${res.status}`;
      logger.warn({ err, connectionId, toPhone: phone }, 'sendWhatsappText failed');
      return { error: err };
    }
    return { waMessageId: json.messages[0]!.id };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
