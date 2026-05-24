import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

/**
 * proxy.ts (Next 16) — antigo middleware.ts.
 * Roda no runtime Node (não Edge), antes de cada request.
 *
 * Responsabilidades:
 *  - Gera `x-request-id` para correlação de logs.
 *  - Adiciona security headers básicos.
 *  - Não toca em sessão (Auth.js lida com isso).
 *
 * Pequeno e focado para não virar fonte de bugs em hot path.
 */

const PUBLIC_PREFIXES = ['/_next', '/favicon', '/static'];

export function proxy(req: NextRequest) {
  // Skip arquivos estáticos
  const path = req.nextUrl.pathname;
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  const requestId = req.headers.get('x-request-id') ?? randomUUID();

  const response = NextResponse.next({
    request: {
      headers: new Headers({ ...Object.fromEntries(req.headers), 'x-request-id': requestId }),
    },
  });

  response.headers.set('x-request-id', requestId);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'SAMEORIGIN');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplicar a tudo exceto:
     * - _next/static (assets)
     * - _next/image (otimização)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
