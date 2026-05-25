import 'server-only';
import type { CategorizationMode } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { encrypt, decrypt } from '@/src/lib/crypto';
import { env } from '@/src/lib/env';
import { audit } from '@/src/services/audit/log';

export type CategorizationConfigView = {
  enabled: boolean;
  mode: CategorizationMode;
  hasTenantKey: boolean;
};

const DEFAULTS: CategorizationConfigView = {
  enabled: false,
  mode: 'auto',
  hasTenantKey: false,
};

export async function getCategorizationConfig(
  organizationId: string,
): Promise<CategorizationConfigView> {
  const cfg = await prisma.categorizationConfig.findUnique({
    where: { organizationId },
    select: { enabled: true, mode: true, geminiApiKeyEnc: true, geminiApiKeyNonce: true },
  });
  if (!cfg) return DEFAULTS;
  return {
    enabled: cfg.enabled,
    mode: cfg.mode,
    hasTenantKey: Boolean(cfg.geminiApiKeyEnc && cfg.geminiApiKeyNonce),
  };
}

/**
 * Resolve a chave Gemini a ser usada: a do tenant (descriptografada) se houver,
 * senão a global de ambiente. Retorna `null` se nenhuma disponível.
 */
export async function resolveGeminiKey(organizationId: string): Promise<string | null> {
  const cfg = await prisma.categorizationConfig.findUnique({
    where: { organizationId },
    select: { geminiApiKeyEnc: true, geminiApiKeyNonce: true },
  });
  if (cfg?.geminiApiKeyEnc && cfg.geminiApiKeyNonce) {
    try {
      return decrypt({ ciphertext: cfg.geminiApiKeyEnc, nonce: cfg.geminiApiKeyNonce });
    } catch {
      /* chave corrompida — cai pro global */
    }
  }
  return env.GEMINI_API_KEY ?? null;
}

export type UpsertCategorizationInput = {
  enabled: boolean;
  mode: CategorizationMode;
  /** undefined = não mexe na chave; '' = remove; string = define nova. */
  geminiApiKey?: string;
};

export async function upsertCategorizationConfig(
  organizationId: string,
  actorUserId: string,
  input: UpsertCategorizationInput,
): Promise<void> {
  const keyUpdate: {
    geminiApiKeyEnc?: string | null;
    geminiApiKeyNonce?: string | null;
  } = {};
  if (input.geminiApiKey !== undefined) {
    const trimmed = input.geminiApiKey.trim();
    if (trimmed === '') {
      keyUpdate.geminiApiKeyEnc = null;
      keyUpdate.geminiApiKeyNonce = null;
    } else {
      const sealed = encrypt(trimmed);
      keyUpdate.geminiApiKeyEnc = sealed.ciphertext;
      keyUpdate.geminiApiKeyNonce = sealed.nonce;
    }
  }

  await prisma.categorizationConfig.upsert({
    where: { organizationId },
    create: {
      organizationId,
      enabled: input.enabled,
      mode: input.mode,
      ...keyUpdate,
    },
    update: {
      enabled: input.enabled,
      mode: input.mode,
      ...keyUpdate,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'categorization.config_updated',
    resourceType: 'categorization_config',
    resourceId: organizationId,
    diff: { after: { enabled: input.enabled, mode: input.mode, keyChanged: input.geminiApiKey !== undefined } },
  });
}
