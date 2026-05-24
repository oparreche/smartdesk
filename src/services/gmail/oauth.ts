import 'server-only';
import { google, type Auth } from 'googleapis';
import { env } from '@/src/lib/env';
import { encrypt, decrypt } from '@/src/lib/crypto';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';
import { logger } from '@/src/lib/logger';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'openid',
  'email',
  'profile',
];

export type ConnectionMissingError = Error & { code: 'reauth_required' | 'not_found' };

function newOAuth2Client(): Auth.OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GMAIL_REDIRECT_URI) {
    throw new Error('Google OAuth não configurado. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GMAIL_REDIRECT_URI.');
  }
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GMAIL_REDIRECT_URI,
  );
}

/**
 * Gera a URL de consentimento OAuth. `state` é um JWT pequeno que carrega organizationId
 * e returnUrl, validado no callback.
 */
export function buildAuthUrl(state: string): string {
  const oauth = newOAuth2Client();
  return oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',          // força re-consentimento pra sempre obter refresh_token
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

/**
 * Processa o callback OAuth: troca code por tokens, identifica a conta Gmail
 * e persiste GmailConnection com refresh token cifrado.
 */
export async function handleCallback(input: {
  organizationId: string;
  actorUserId: string;
  code: string;
}): Promise<{ connectionId: string; emailAddress: string }> {
  const oauth = newOAuth2Client();
  const { tokens } = await oauth.getToken(input.code);

  if (!tokens.refresh_token) {
    throw new Error('Sem refresh_token na resposta. Tente reconectar com prompt=consent.');
  }
  if (!tokens.access_token) {
    throw new Error('Sem access_token na resposta.');
  }

  oauth.setCredentials(tokens);

  // Identifica a conta Gmail
  const gmail = google.gmail({ version: 'v1', auth: oauth });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const emailAddress = profile.data.emailAddress;
  if (!emailAddress) throw new Error('Não foi possível obter email da conta Google');

  const enc = encrypt(tokens.refresh_token);

  const existing = await prisma.gmailConnection.findFirst({
    where: { organizationId: input.organizationId, emailAddress, deletedAt: null },
    select: { id: true },
  });

  let connectionId: string;
  if (existing) {
    await prisma.gmailConnection.update({
      where: { id: existing.id },
      data: {
        refreshTokenEnc: enc.ciphertext,
        refreshTokenNonce: enc.nonce,
        scopes: SCOPES.join(' '),
        status: 'active',
        lastError: null,
        lastErrorAt: null,
      },
    });
    connectionId = existing.id;
  } else {
    const created = await prisma.gmailConnection.create({
      data: {
        organizationId: input.organizationId,
        emailAddress,
        refreshTokenEnc: enc.ciphertext,
        refreshTokenNonce: enc.nonce,
        scopes: SCOPES.join(' '),
        historyId: profile.data.historyId ?? null,
      },
      select: { id: true },
    });
    connectionId = created.id;
  }

  await audit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: 'gmail.connection.created',
    resourceType: 'gmail_connection',
    resourceId: connectionId,
    diff: { after: { emailAddress } },
  });

  logger.info({ org: input.organizationId, connectionId, emailAddress }, 'gmail connection saved');

  return { connectionId, emailAddress };
}

/**
 * Reidrata um OAuth2Client a partir da GmailConnection. Atualiza access token via refresh.
 * Lança ConnectionMissingError com code='reauth_required' se o refresh falhar.
 */
export async function authenticatedClient(connectionId: string): Promise<{
  client: Auth.OAuth2Client;
  emailAddress: string;
  organizationId: string;
  historyId: string | null;
}> {
  const conn = await prisma.gmailConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      organizationId: true,
      emailAddress: true,
      refreshTokenEnc: true,
      refreshTokenNonce: true,
      status: true,
      historyId: true,
      deletedAt: true,
    },
  });
  if (!conn || conn.deletedAt) {
    const err = new Error('Conexão Gmail não encontrada') as ConnectionMissingError;
    err.code = 'not_found';
    throw err;
  }
  if (conn.status !== 'active') {
    const err = new Error('Conexão Gmail não está ativa') as ConnectionMissingError;
    err.code = 'reauth_required';
    throw err;
  }

  const oauth = newOAuth2Client();
  const refreshToken = decrypt({
    ciphertext: conn.refreshTokenEnc,
    nonce: conn.refreshTokenNonce,
  });
  oauth.setCredentials({ refresh_token: refreshToken });

  try {
    await oauth.getAccessToken();
  } catch (err) {
    await prisma.gmailConnection.update({
      where: { id: conn.id },
      data: {
        status: 'reauth_required',
        lastError: (err as Error).message.slice(0, 1000),
        lastErrorAt: new Date(),
      },
    });
    const e = new Error('Falha ao renovar access token') as ConnectionMissingError;
    e.code = 'reauth_required';
    throw e;
  }

  return {
    client: oauth,
    emailAddress: conn.emailAddress,
    organizationId: conn.organizationId,
    historyId: conn.historyId,
  };
}

export async function disconnectConnection(
  organizationId: string,
  actorUserId: string,
  connectionId: string,
): Promise<void> {
  const conn = await prisma.gmailConnection.findFirst({
    where: { id: connectionId, organizationId, deletedAt: null },
    select: { id: true, emailAddress: true },
  });
  if (!conn) throw new Error('Conexão não encontrada');

  await prisma.gmailConnection.update({
    where: { id: conn.id },
    data: {
      status: 'disabled',
      deletedAt: new Date(),
      refreshTokenEnc: '',
      refreshTokenNonce: '',
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'gmail.connection.disconnected',
    resourceType: 'gmail_connection',
    resourceId: conn.id,
    diff: { before: { emailAddress: conn.emailAddress } },
  });
}
