import 'server-only';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { logger } from './logger';

/**
 * Cria um child logger com os campos de contexto desta request:
 *   { req_id, org, user }
 *
 * Em rotas que não passam pelo proxy (rotas system, scripts), retorna o logger raiz.
 *
 * Uso típico em route handlers e server actions:
 *   const log = await requestLogger();
 *   log.info({ extra: '...' }, 'algo aconteceu');
 */
export async function requestLogger() {
  let reqId: string | undefined;
  let userId: string | undefined;
  let orgId: string | undefined;

  try {
    const h = await headers();
    reqId = h.get('x-request-id') ?? undefined;
  } catch {
    /* fora de contexto de request — ok */
  }

  try {
    const session = await auth();
    userId = session?.user?.id;
    orgId = session?.user?.activeOrganizationId ?? undefined;
  } catch {
    /* sem sessão — ok */
  }

  return logger.child({ req_id: reqId, user: userId, org: orgId });
}
