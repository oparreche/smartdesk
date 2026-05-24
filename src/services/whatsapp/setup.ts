import 'server-only';
import { randomBytes } from 'node:crypto';
import { type Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { encrypt, decrypt, maskLast4 } from '@/src/lib/crypto';
import { audit } from '@/src/services/audit/log';

export type WhatsappSetupInput = {
  organizationId: string;
  actorUserId: string;
  displayPhoneNumber: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  appSecret?: string;
};

export type WhatsappConnectionView = {
  id: string;
  displayPhoneNumber: string;
  phoneNumberId: string;
  businessAccountId: string;
  status: 'active' | 'disabled' | 'error';
  tokenLast4: string;
  webhookVerifyToken: string;
  hasAppSecret: boolean;
  lastReceivedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  webhookUrl: string;
};

export async function listConnections(organizationId: string) {
  return prisma.whatsappConnection.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      displayPhoneNumber: true,
      phoneNumberId: true,
      businessAccountId: true,
      status: true,
      accessTokenEnc: true,
      accessTokenNonce: true,
      appSecretEnc: true,
      webhookVerifyToken: true,
      lastReceivedAt: true,
      lastError: true,
      createdAt: true,
    },
  });
}

export async function createConnection(input: WhatsappSetupInput): Promise<{ id: string; webhookVerifyToken: string }> {
  const tokenSealed = encrypt(input.accessToken);
  const secretSealed = input.appSecret ? encrypt(input.appSecret) : null;
  const verifyToken = randomBytes(24).toString('base64url');

  const created = await prisma.whatsappConnection.create({
    data: {
      organizationId: input.organizationId,
      displayPhoneNumber: input.displayPhoneNumber.trim(),
      phoneNumberId: input.phoneNumberId.trim(),
      businessAccountId: input.businessAccountId.trim(),
      accessTokenEnc: tokenSealed.ciphertext,
      accessTokenNonce: tokenSealed.nonce,
      appSecretEnc: secretSealed?.ciphertext ?? null,
      appSecretNonce: secretSealed?.nonce ?? null,
      webhookVerifyToken: verifyToken,
      status: 'active',
    },
    select: { id: true, webhookVerifyToken: true },
  });

  await audit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: 'whatsapp.connection.created',
    resourceType: 'whatsapp_connection',
    resourceId: created.id,
    diff: { after: { phoneNumberId: input.phoneNumberId, displayPhoneNumber: input.displayPhoneNumber } },
  });

  return created;
}

export async function updateConnection(
  organizationId: string,
  actorUserId: string,
  connectionId: string,
  input: { accessToken?: string; appSecret?: string; status?: 'active' | 'disabled' },
): Promise<void> {
  const existing = await prisma.whatsappConnection.findFirst({
    where: { id: connectionId, organizationId, deletedAt: null },
    select: { id: true, phoneNumberId: true },
  });
  if (!existing) throw new Error('Conexão não encontrada');

  const data: Prisma.WhatsappConnectionUpdateInput = {};
  if (input.accessToken) {
    const s = encrypt(input.accessToken);
    data.accessTokenEnc = s.ciphertext;
    data.accessTokenNonce = s.nonce;
  }
  if (input.appSecret !== undefined) {
    if (input.appSecret) {
      const s = encrypt(input.appSecret);
      data.appSecretEnc = s.ciphertext;
      data.appSecretNonce = s.nonce;
    } else {
      data.appSecretEnc = null;
      data.appSecretNonce = null;
    }
  }
  if (input.status !== undefined) data.status = input.status;

  if (Object.keys(data).length === 0) return;
  await prisma.whatsappConnection.update({ where: { id: connectionId }, data });

  await audit({
    organizationId,
    actorUserId,
    action: 'whatsapp.connection.updated',
    resourceType: 'whatsapp_connection',
    resourceId: connectionId,
    diff: { after: { tokenRotated: Boolean(input.accessToken), status: input.status } },
  });
}

export async function disconnectConnection(
  organizationId: string,
  actorUserId: string,
  connectionId: string,
): Promise<void> {
  const existing = await prisma.whatsappConnection.findFirst({
    where: { id: connectionId, organizationId, deletedAt: null },
    select: { id: true, phoneNumberId: true },
  });
  if (!existing) throw new Error('Conexão não encontrada');

  await prisma.whatsappConnection.update({
    where: { id: connectionId },
    data: {
      status: 'disabled',
      deletedAt: new Date(),
      accessTokenEnc: '',
      accessTokenNonce: '',
      appSecretEnc: null,
      appSecretNonce: null,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'whatsapp.connection.disconnected',
    resourceType: 'whatsapp_connection',
    resourceId: connectionId,
    diff: { before: { phoneNumberId: existing.phoneNumberId } },
  });
}

export function buildConnectionView(
  conn: Awaited<ReturnType<typeof listConnections>>[number],
  appUrl: string,
): WhatsappConnectionView {
  let tokenLast4 = '';
  try {
    const t = decrypt({ ciphertext: conn.accessTokenEnc, nonce: conn.accessTokenNonce });
    tokenLast4 = maskLast4(t);
  } catch {
    tokenLast4 = '****';
  }
  return {
    id: conn.id,
    displayPhoneNumber: conn.displayPhoneNumber,
    phoneNumberId: conn.phoneNumberId,
    businessAccountId: conn.businessAccountId,
    status: conn.status,
    tokenLast4,
    webhookVerifyToken: conn.webhookVerifyToken,
    hasAppSecret: Boolean(conn.appSecretEnc),
    lastReceivedAt: conn.lastReceivedAt,
    lastError: conn.lastError,
    createdAt: conn.createdAt,
    webhookUrl: `${appUrl}/api/webhooks/whatsapp/${conn.id}`,
  };
}

/**
 * Decifra o access token de uma conexão. Use apenas em escopo limitado
 * (envio de mensagem, busca de mídia). Nunca armazenar o valor decifrado.
 */
export async function decryptAccessToken(connectionId: string): Promise<string> {
  const conn = await prisma.whatsappConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: { accessTokenEnc: true, accessTokenNonce: true },
  });
  return decrypt({ ciphertext: conn.accessTokenEnc, nonce: conn.accessTokenNonce });
}

export async function decryptAppSecret(connectionId: string): Promise<string | null> {
  const conn = await prisma.whatsappConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: { appSecretEnc: true, appSecretNonce: true },
  });
  if (!conn.appSecretEnc || !conn.appSecretNonce) return null;
  return decrypt({ ciphertext: conn.appSecretEnc, nonce: conn.appSecretNonce });
}
