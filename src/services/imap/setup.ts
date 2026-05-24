import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { encrypt, decrypt, type Sealed, maskLast4 } from '@/src/lib/crypto';
import { audit } from '@/src/services/audit/log';
import type { ImapSecurity } from './client';
import type { SmtpSecurity } from './smtp';

export type CreateConnectionInput = {
  displayName: string;
  emailAddress: string;
  imap: {
    host: string;
    port: number;
    security: ImapSecurity;
    user: string;
    password: string;
    folder?: string;
  };
  smtp: {
    host: string;
    port: number;
    security: SmtpSecurity;
    user: string;
    password: string;
    fromName?: string;
  };
};

export async function createConnection(
  organizationId: string,
  actorUserId: string,
  input: CreateConnectionInput,
): Promise<{ id: string }> {
  const imapEnc = encrypt(input.imap.password);
  const smtpEnc = encrypt(input.smtp.password);

  const created = await prisma.imapSmtpConnection.create({
    data: {
      organizationId,
      displayName: input.displayName.slice(0, 120),
      emailAddress: input.emailAddress.trim().toLowerCase().slice(0, 200),
      imapHost: input.imap.host.trim(),
      imapPort: input.imap.port,
      imapSecurity: input.imap.security,
      imapUser: input.imap.user.trim(),
      imapPasswordEnc: imapEnc as unknown as object,
      imapFolder: input.imap.folder?.trim() || 'INBOX',
      smtpHost: input.smtp.host.trim(),
      smtpPort: input.smtp.port,
      smtpSecurity: input.smtp.security,
      smtpUser: input.smtp.user.trim(),
      smtpPasswordEnc: smtpEnc as unknown as object,
      smtpFromName: input.smtp.fromName?.trim().slice(0, 120) || null,
      status: 'active',
    },
    select: { id: true },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'imap_smtp.connect',
    resourceType: 'imap_smtp_connection',
    resourceId: created.id,
    diff: {
      after: {
        email: input.emailAddress,
        imapHost: input.imap.host,
        smtpHost: input.smtp.host,
      },
    },
  });

  return created;
}

export async function listConnections(organizationId: string) {
  return prisma.imapSmtpConnection.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      displayName: true,
      emailAddress: true,
      imapHost: true,
      imapPort: true,
      imapSecurity: true,
      imapUser: true,
      imapFolder: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecurity: true,
      smtpUser: true,
      smtpFromName: true,
      status: true,
      lastSyncedAt: true,
      lastError: true,
      lastErrorAt: true,
    },
  });
}

export async function getConnectionWithCreds(connectionId: string) {
  const conn = await prisma.imapSmtpConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      organizationId: true,
      displayName: true,
      emailAddress: true,
      imapHost: true,
      imapPort: true,
      imapSecurity: true,
      imapUser: true,
      imapPasswordEnc: true,
      imapFolder: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecurity: true,
      smtpUser: true,
      smtpPasswordEnc: true,
      smtpFromName: true,
      lastUid: true,
      lastUidValidity: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!conn || conn.deletedAt) return null;

  return {
    ...conn,
    imapPassword: decrypt(conn.imapPasswordEnc as unknown as Sealed),
    smtpPassword: decrypt(conn.smtpPasswordEnc as unknown as Sealed),
    imapSecurity: conn.imapSecurity as ImapSecurity,
    smtpSecurity: conn.smtpSecurity as SmtpSecurity,
  };
}

export async function pauseConnection(
  organizationId: string,
  actorUserId: string,
  id: string,
  paused: boolean,
): Promise<void> {
  const c = await prisma.imapSmtpConnection.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!c) return;
  await prisma.imapSmtpConnection.update({
    where: { id },
    data: { status: paused ? 'paused' : 'active', lastError: null, lastErrorAt: null },
  });
  await audit({
    organizationId,
    actorUserId,
    action: paused ? 'imap_smtp.pause' : 'imap_smtp.resume',
    resourceType: 'imap_smtp_connection',
    resourceId: id,
    diff: { before: { status: c.status }, after: { status: paused ? 'paused' : 'active' } },
  });
}

export async function deleteConnection(
  organizationId: string,
  actorUserId: string,
  id: string,
): Promise<void> {
  const c = await prisma.imapSmtpConnection.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, emailAddress: true },
  });
  if (!c) return;
  await prisma.imapSmtpConnection.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'paused' },
  });
  await audit({
    organizationId,
    actorUserId,
    action: 'imap_smtp.disconnect',
    resourceType: 'imap_smtp_connection',
    resourceId: id,
    diff: { before: { email: c.emailAddress } },
  });
}

export type ConnectionView = Awaited<ReturnType<typeof listConnections>>[number] & {
  imapPasswordMasked: string;
  smtpPasswordMasked: string;
};

export function maskedView(conn: Awaited<ReturnType<typeof listConnections>>[number]): ConnectionView {
  return {
    ...conn,
    imapPasswordMasked: maskLast4('hidden'),
    smtpPasswordMasked: maskLast4('hidden'),
  };
}
