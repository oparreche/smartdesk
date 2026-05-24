import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/src/lib/cron-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // TODO Fase 7: implementar verificação de SLAs vencidos
  return NextResponse.json({ checked: 0 });
}
