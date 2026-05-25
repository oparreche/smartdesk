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
  value: WaChangeValue | WaTemplateStatusValue;
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

/** Payload do field "message_template_status_update". */
export type WaTemplateStatusValue = {
  event: 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL' | 'PENDING_DELETION' | string;
  message_template_id: number | string;
  message_template_name: string;
  message_template_language: string;
  reason?: string;
  other_info?: { title?: string; description?: string };
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
  conversation?: {
    id: string;
    origin?: { type?: 'marketing' | 'utility' | 'authentication' | 'service' | string };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable?: boolean;
    pricing_model?: 'CBP' | 'PMP' | string;
    category?: 'marketing' | 'utility' | 'authentication' | 'service' | string;
  };
};

/**
 * Extrai mensagens inbound + status updates + template status updates de um payload bruto.
 */
export function extractEvents(payload: WaWebhookPayload): {
  messages: Array<{ phoneNumberId: string; message: WaInboundMessage; contactName?: string }>;
  statuses: Array<{ phoneNumberId: string; status: WaStatusUpdate }>;
  templateUpdates: WaTemplateStatusValue[];
} {
  const messages: Array<{ phoneNumberId: string; message: WaInboundMessage; contactName?: string }> = [];
  const statuses: Array<{ phoneNumberId: string; status: WaStatusUpdate }> = [];
  const templateUpdates: WaTemplateStatusValue[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      // Template status update — value tem shape diferente, sem metadata.phone_number_id
      if (change.field === 'message_template_status_update') {
        const tv = change.value as WaTemplateStatusValue;
        if (tv && tv.message_template_id) {
          templateUpdates.push(tv);
        }
        continue;
      }

      const v = change.value as WaChangeValue;
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

  return { messages, statuses, templateUpdates };
}
