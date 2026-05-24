'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { submitSurvey } from '@/src/services/csat';

const Input = z.object({
  token: z.string().min(8).max(80),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export type SubmitState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export async function submitCsatAction(
  _prev: SubmitState,
  form: FormData,
): Promise<SubmitState> {
  const parsed = Input.safeParse({
    token: form.get('token'),
    rating: form.get('rating'),
    comment: form.get('comment') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' };

  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0].trim() ??
    h.get('x-real-ip') ??
    undefined;

  const result = await submitSurvey({
    token: parsed.data.token,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
    ipAddress: ip,
  });
  if (result.ok) return { ok: true };
  return { ok: false, error: result.reason };
}
