import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { audit } from '@/src/services/audit/log';
import { enqueue } from '@/src/services/jobs/enqueue';
import { safeFetch } from '@/src/lib/http-client';

export type WebhookEvent =
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.status_changed'
  | 'ticket.assigned'
  | 'ticket.closed'
  | 'ticket.tag_added'
  | 'message.added'
  | 'csat.received';

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'ticket.created',
  'ticket.updated',
  'ticket.status_changed',
  'ticket.assigned',
  'ticket.closed',
  'ticket.tag_added',
  'message.added',
  'csat.received',
];

const NAME_MAX = 120;
const URL_MAX = 500;
const PER_ORG_LIMIT = 50;

export type CreateEndpointInput = {
  name: string;
  url: string;
  events: WebhookEvent[];
};

function genSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export async function listEndpoints(organizationId: string) {
  return prisma.webhookEndpoint.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      url: true,
      events: true,
      secret: true,
      enabled: true,
      deliveryCount: true,
      failureCount: true,
      lastDeliveryAt: true,
      lastError: true,
      lastErrorAt: true,
      createdAt: true,
    },
  });
}

export async function createEndpoint(
  organizationId: string,
  actorUserId: string,
  input: CreateEndpointInput,
): Promise<{ id: string; secret: string }> {
  const name = input.name.trim().slice(0, NAME_MAX);
  if (!name) throw new Error('Nome obrigatório');
  const url = input.url.trim().slice(0, URL_MAX);
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('URL precisa ser http(s)');
    }
  } catch {
    throw new Error('URL inválida');
  }

  const events = input.events.filter((e) =>
    (WEBHOOK_EVENTS as string[]).includes(e),
  );
  if (events.length === 0) throw new Error('Pelo menos 1 evento obrigatório');

  const total = await prisma.webhookEndpoint.count({
    where: { organizationId, deletedAt: null },
  });
  if (total >= PER_ORG_LIMIT) throw new Error(`Limite de ${PER_ORG_LIMIT} webhooks`);

  const secret = genSecret();
  const created = await prisma.webhookEndpoint.create({
    data: {
      organizationId,
      name,
      url,
      events: events as unknown as object,
      secret,
      createdById: actorUserId,
    },
    select: { id: true },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'webhook.create',
    resourceType: 'webhook_endpoint',
    resourceId: created.id,
    diff: { after: { name, url, events } },
  });

  return { id: created.id, secret };
}

export async function toggleEndpoint(
  organizationId: string,
  actorUserId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  const e = await prisma.webhookEndpoint.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!e) return;
  await prisma.webhookEndpoint.update({
    where: { id },
    data: { enabled, lastError: null, lastErrorAt: null },
  });
  await audit({
    organizationId,
    actorUserId,
    action: enabled ? 'webhook.enable' : 'webhook.disable',
    resourceType: 'webhook_endpoint',
    resourceId: id,
    diff: { after: { enabled } },
  });
}

export async function deleteEndpoint(
  organizationId: string,
  actorUserId: string,
  id: string,
): Promise<void> {
  const e = await prisma.webhookEndpoint.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!e) return;
  await prisma.webhookEndpoint.update({
    where: { id },
    data: { deletedAt: new Date(), enabled: false },
  });
  await audit({
    organizationId,
    actorUserId,
    action: 'webhook.delete',
    resourceType: 'webhook_endpoint',
    resourceId: id,
    diff: { before: { name: e.name } },
  });
}

/**
 * Enfileira disparos pra todos os endpoints inscritos no evento.
 */
export async function dispatchEvent(input: {
  organizationId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        organizationId: input.organizationId,
        enabled: true,
        deletedAt: null,
      },
      select: { id: true, events: true },
    });
    const subscribed = endpoints.filter((e) => {
      const evts = z.array(z.string()).safeParse(e.events);
      return evts.success && evts.data.includes(input.event);
    });
    for (const e of subscribed) {
      await enqueue({
        type: 'webhook.deliver',
        payload: {
          endpointId: e.id,
          event: input.event,
          payload: input.payload,
          timestamp: new Date().toISOString(),
        },
        organizationId: input.organizationId,
        dedupKey: `webhook.deliver:${e.id}:${input.event}:${Date.now()}`,
        maxAttempts: 5,
      });
    }
  } catch (err) {
    logger.warn({ err, event: input.event }, 'webhook.dispatchEvent failed');
  }
}

const DeliverPayloadSchema = z.object({
  endpointId: z.string().uuid(),
  event: z.string(),
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.string(),
});

export async function deliverWebhook(raw: unknown): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> {
  const parsed = DeliverPayloadSchema.parse(raw);
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: parsed.endpointId, deletedAt: null },
    select: {
      id: true,
      organizationId: true,
      url: true,
      secret: true,
      enabled: true,
    },
  });
  if (!endpoint || !endpoint.enabled) {
    return { ok: false, error: 'endpoint_disabled' };
  }

  const body = JSON.stringify({
    event: parsed.event,
    timestamp: parsed.timestamp,
    organizationId: endpoint.organizationId,
    data: parsed.payload,
  });

  const signature = createHmac('sha256', endpoint.secret)
    .update(`${parsed.timestamp}.${body}`)
    .digest('hex');

  try {
    const res = await safeFetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SmartDesk-Webhook/1.0',
        'X-SmartDesk-Event': parsed.event,
        'X-SmartDesk-Timestamp': parsed.timestamp,
        'X-SmartDesk-Signature': `sha256=${signature}`,
      },
      body,
      timeoutMs: 15_000,
      maxResponseBytes: 5_000,
    });

    const ok = res.status >= 200 && res.status < 300;
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        deliveryCount: { increment: 1 },
        ...(ok
          ? { lastDeliveryAt: new Date(), lastError: null, lastErrorAt: null }
          : {
              failureCount: { increment: 1 },
              lastError: `HTTP ${res.status}`,
              lastErrorAt: new Date(),
            }),
      },
    });
    if (!ok) {
      logger.warn(
        { endpointId: endpoint.id, status: res.status, event: parsed.event },
        'webhook.deliver non-2xx',
      );
      throw new Error(`webhook returned ${res.status}`);
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const msg = (err as Error).message;
    await prisma.webhookEndpoint
      .update({
        where: { id: endpoint.id },
        data: {
          failureCount: { increment: 1 },
          lastError: msg.slice(0, 500),
          lastErrorAt: new Date(),
        },
      })
      .catch(() => {});
    throw err;
  }
}
