import { NextResponse, type NextRequest } from 'next/server';
import {
  submitForm,
  FormValidationError,
  FormSubmissionRejectedError,
} from '@/src/services/forms/submit';
import { checkRateLimit } from '@/src/lib/rate-limit';
import { logger } from '@/src/lib/logger';
import { env } from '@/src/lib/env';

export const runtime = 'nodejs';

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') || null;
}

function redirectTo(_req: NextRequest, path: string, query: Record<string, string> = {}) {
  const url = new URL(path, env.APP_URL);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;

  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent');
  const accepts = req.headers.get('accept') ?? '';
  const wantsJson = accepts.includes('application/json');

  // Rate-limit: 5 submissões / 60s por IP por slug
  const rl = await checkRateLimit({
    bucket: `form-submit:${slug}:${ip ?? 'unknown'}`,
    windowSeconds: 60,
    max: 5,
  });
  if (!rl.allowed) {
    if (wantsJson) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rl.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }
    return redirectTo(req, `/f/${slug}`, {
      error: `Muitas tentativas. Tente novamente em ${rl.retryAfterSeconds}s.`,
    });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  }

  const data: Record<string, FormDataEntryValue> = {};
  for (const [k, v] of formData.entries()) data[k] = v;

  try {
    const result = await submitForm({ slug, data, ip, userAgent });
    if (wantsJson) {
      return NextResponse.json({ ok: true, code: result.ticketCode });
    }
    return redirectTo(req, `/f/${slug}/success/${result.ticketCode}`);
  } catch (err) {
    if (err instanceof FormSubmissionRejectedError) {
      // Não revelar detalhes para bots
      logger.info({ slug, ip }, 'form submission rejected');
      if (wantsJson) {
        return NextResponse.json({ ok: true });
      }
      return redirectTo(req, `/f/${slug}/success/REJECTED`);
    }
    if (err instanceof FormValidationError) {
      if (wantsJson) {
        return NextResponse.json(
          { error: 'validation', field: err.fieldKey, message: err.message },
          { status: 422 },
        );
      }
      return redirectTo(req, `/f/${slug}`, { error: err.message });
    }
    logger.error({ err, slug, ip }, 'form submission failed');
    return wantsJson
      ? NextResponse.json({ error: 'internal' }, { status: 500 })
      : redirectTo(req, `/f/${slug}`, { error: 'Erro inesperado. Tente novamente.' });
  }
}
