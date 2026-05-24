/**
 * Tipos parciais do payload do webhook WhatsApp Cloud API (Meta).
 * Referência: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 *
 * Mantemos apenas o que usamos. Campos extras vêm via index signature.
 */

export type WaWebhookPayload = {
  object: 'whatsapp_business_account' | string;
  entry?: WaEntry[];
};

export type WaEntry = {
  id: string;
  changes?: WaChange[];
};

export type WaChange = {
  field: string;
  value: WaChangeValue;
};

export type WaChangeValue = {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id: string;
  }>;
  messages?: WaInboundMessage[];
  statuses?: WaStatusUpdate[];
};

export type WaInboundMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'button' | 'interactive' | 'reaction' | 'sticker' | 'location' | string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  context?: { from?: string; id?: string };
  errors?: Array<{ code: number; title?: string; message?: string }>;
};

export type WaStatusUpdate = {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title?: string; message?: string }>;
};

/**
 * Extrai mensagens inbound + status updates de um payload bruto.
 */
export function extractEvents(payload: WaWebhookPayload): {
  messages: Array<{ phoneNumberId: string; message: WaInboundMessage; contactName?: string }>;
  statuses: Array<{ phoneNumberId: string; status: WaStatusUpdate }>;
} {
  const messages: ReturnType<typeof extractEvents>['messages'] = [];
  const statuses: ReturnType<typeof extractEvents>['statuses'] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const pnid = v?.metadata?.phone_number_id;
      if (!pnid) continue;

      const contactsByWaId = new Map<string, string>();
      for (const c of v.contacts ?? []) {
        if (c.profile?.name) contactsByWaId.set(c.wa_id, c.profile.name);
      }

      for (const m of v.messages ?? []) {
        messages.push({
          phoneNumberId: pnid,
          message: m,
          contactName: contactsByWaId.get(m.from),
        });
      }
      for (const s of v.statuses ?? []) {
        statuses.push({ phoneNumberId: pnid, status: s });
      }
    }
  }

  return { messages, statuses };
}
