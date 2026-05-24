'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import {
  createConnection,
  deleteConnection,
  pauseConnection,
} from '@/src/services/imap/setup';
import { testConnection } from '@/src/services/imap/client';
import { verifyTransport } from '@/src/services/imap/smtp';
import { pollConnection } from '@/src/services/imap/ingest';

const Security = z.enum(['ssl', 'starttls', 'none']);

const ConnInput = z.object({
  displayName: z.string().min(1).max(120),
  emailAddress: z.string().email().max(200),
  imapHost: z.string().min(1).max(200),
  imapPort: z.coerce.number().int().min(1).max(65535),
  imapSecurity: Security,
  imapUser: z.string().min(1).max(200),
  imapPassword: z.string().min(1).max(500),
  imapFolder: z.string().max(80).optional(),
  smtpHost: z.string().min(1).max(200),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecurity: Security,
  smtpUser: z.string().min(1).max(200),
  smtpPassword: z.string().min(1).max(500),
  smtpFromName: z.string().max(120).optional(),
});

export type ConnState =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | undefined;

export async function createConnectionAction(
  _prev: ConnState,
  form: FormData,
): Promise<ConnState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');

  const parsed = ConnInput.safeParse({
    displayName: form.get('displayName'),
    emailAddress: form.get('emailAddress'),
    imapHost: form.get('imapHost'),
    imapPort: form.get('imapPort'),
    imapSecurity: form.get('imapSecurity'),
    imapUser: form.get('imapUser'),
    imapPassword: form.get('imapPassword'),
    imapFolder: form.get('imapFolder') || undefined,
    smtpHost: form.get('smtpHost'),
    smtpPort: form.get('smtpPort'),
    smtpSecurity: form.get('smtpSecurity'),
    smtpUser: form.get('smtpUser'),
    smtpPassword: form.get('smtpPassword'),
    smtpFromName: form.get('smtpFromName') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const d = parsed.data;

  try {
    const result = await createConnection(ctx.organizationId, ctx.userId, {
      displayName: d.displayName,
      emailAddress: d.emailAddress,
      imap: {
        host: d.imapHost,
        port: d.imapPort,
        security: d.imapSecurity,
        user: d.imapUser,
        password: d.imapPassword,
        folder: d.imapFolder,
      },
      smtp: {
        host: d.smtpHost,
        port: d.smtpPort,
        security: d.smtpSecurity,
        user: d.smtpUser,
        password: d.smtpPassword,
        fromName: d.smtpFromName,
      },
    });
    revalidatePath('/settings/imap');
    return { ok: true, id: result.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function testConnectionAction(form: FormData): Promise<{
  imap: { ok: boolean; message: string };
  smtp: { ok: boolean; message: string };
}> {
  await getOrgContext();
  const data = ConnInput.partial().safeParse({
    imapHost: form.get('imapHost'),
    imapPort: form.get('imapPort'),
    imapSecurity: form.get('imapSecurity'),
    imapUser: form.get('imapUser'),
    imapPassword: form.get('imapPassword'),
    imapFolder: form.get('imapFolder') || undefined,
    smtpHost: form.get('smtpHost'),
    smtpPort: form.get('smtpPort'),
    smtpSecurity: form.get('smtpSecurity'),
    smtpUser: form.get('smtpUser'),
    smtpPassword: form.get('smtpPassword'),
    emailAddress: form.get('emailAddress'),
  });

  if (!data.success) {
    return {
      imap: { ok: false, message: 'preencha os campos primeiro' },
      smtp: { ok: false, message: 'preencha os campos primeiro' },
    };
  }
  const d = data.data;

  const [imap, smtp] = await Promise.all([
    d.imapHost && d.imapPort && d.imapSecurity && d.imapUser && d.imapPassword
      ? testConnection({
          host: d.imapHost,
          port: d.imapPort,
          security: d.imapSecurity,
          user: d.imapUser,
          password: d.imapPassword,
          folder: d.imapFolder,
        })
      : Promise.resolve({ ok: false as const, error: 'IMAP incompleto' }),
    d.smtpHost && d.smtpPort && d.smtpSecurity && d.smtpUser && d.smtpPassword && d.emailAddress
      ? verifyTransport({
          host: d.smtpHost,
          port: d.smtpPort,
          security: d.smtpSecurity,
          user: d.smtpUser,
          password: d.smtpPassword,
          fromAddress: d.emailAddress,
        })
      : Promise.resolve({ ok: false as const, error: 'SMTP incompleto' }),
  ]);

  return {
    imap: imap.ok
      ? { ok: true, message: `conectado (${imap.serverInfo.name}, ${imap.mailboxes} pastas)` }
      : { ok: false, message: imap.error },
    smtp: smtp.ok
      ? { ok: true, message: 'autenticado com sucesso' }
      : { ok: false, message: smtp.error },
  };
}

export async function pauseConnectionAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');
  const id = String(form.get('id') ?? '');
  const paused = form.get('paused') === 'true';
  if (!id) return;
  try {
    await pauseConnection(ctx.organizationId, ctx.userId, id, paused);
  } catch {
    /* noop */
  }
  revalidatePath('/settings/imap');
}

export async function deleteConnectionAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');
  const id = String(form.get('id') ?? '');
  if (!id) return;
  try {
    await deleteConnection(ctx.organizationId, ctx.userId, id);
  } catch {
    /* noop */
  }
  revalidatePath('/settings/imap');
}

export async function pollNowAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');
  const id = String(form.get('id') ?? '');
  if (!id) return;
  try {
    await pollConnection(id);
  } catch {
    /* erro já é gravado em lastError */
  }
  revalidatePath('/settings/imap');
}
