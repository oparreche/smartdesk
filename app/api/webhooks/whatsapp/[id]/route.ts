import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { verifyWhatsappSignature } from '@/src/services/whatsapp/verify';
import { decryptAppSecret } from '@/src/services/whatsapp/setup';
import { ingestWhatsappWebhook } from '@/src/services/whatsapp/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/webhooks/whatsapp/[id]
 *
 * Verificação inicial chamada pelo Meta. Espera:
 *   hub.mode=subscribe & hub.verify_token=<token configurado> & hub.challenge=<string>
 * Resposta deve ser `hub.challenge` em texto puro com 200.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !token || !challenge) {
    return new NextResponse('bad_request', { status: 400 });
  }

  const conn = await prisma.whatsappConnection.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, webhookVerifyToken: true, status: true },
  });
  if (!conn) {
    return new NextResponse('not_found', { status: 404 });
  }
  if (conn.webhookVerifyToken !== token) {
    logger.warn({ connectionId: id }, 'whatsapp webhook verify: bad token');
    return new NextResponse('forbidden', { status: 403 });
  }

  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

/**
 * POST /api/webhooks/whatsapp/[id]
 *
 * Recebe eventos do Meta. Validação:
 *  1. Conexão existe e está ativa.
 *  2. Se appSecret configurado, valida HMAC `X-Hub-Signature-256`.
 *  3. Parseia payload, ingere mensagens/status updates.
 *
 * Importante: Meta espera 200 em até 20s. Em produção, considerar enfileirar
 * o processamento e responder 200 imediatamente. No MVP processamos síncrono
 * pois volume é baixo e ingest é rápido.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const rawBody = await req.text();

  const conn = await prisma.whatsappConnection.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true, appSecretEnc: true, organizationId: true },
  });
  if (!conn) {
    return new NextResponse('not_found', { status: 404 });
  }
  if (conn.status !== 'active') {
    return new NextResponse('inactive', { status: 410 });
  }

  // Validação de assinatura (se appSecret configurado)
  if (conn.appSecretEnc) {
    const sig = req.headers.get('x-hub-signature-256');
    let appSecret: string | null = null;
    try {
      appSecret = await decryptAppSecret(conn.id);
    } catch (err) {
      logger.error({ err, connectionId: conn.id }, 'whatsapp webhook: failed to decrypt app secret');
      return new NextResponse('internal', { status: 500 });
    }
    if (!appSecret || !verifyWhatsappSignature({ rawBody, signatureHeader: sig, appSecret })) {
      logger.warn({ connectionId: conn.id }, 'whatsapp webhook: invalid signature');
      return new NextResponse('forbidden', { status: 403 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('bad_json', { status: 400 });
  }

  try {
    const result = await ingestWhatsappWebhook(conn.id, payload as Parameters<typeof ingestWhatsappWebhook>[1]);
    logger.info(
      { connectionId: conn.id, ...result },
      'whatsapp webhook processed',
    );
  } catch (err) {
    logger.error({ err, connectionId: conn.id }, 'whatsapp webhook ingest failed');
    await prisma.whatsappConnection.update({
      where: { id: conn.id },
      data: { lastError: (err as Error).message.slice(0, 1000), lastErrorAt: new Date() },
    });
    // Mesmo em erro, retornamos 200 pro Meta não reenfileirar infinito.
  }

  return NextResponse.json({ ok: true });
}
