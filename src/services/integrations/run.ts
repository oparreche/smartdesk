import 'server-only';
import { Prisma, type ApiIntegration, type RunStatus } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { safeFetch, SsrfBlockedError, HttpClientError } from '@/src/lib/http-client';
import { logger } from '@/src/lib/logger';
import { buildTicketContext } from '@/src/services/enrichment/context';
import { saveEnrichment } from '@/src/services/enrichment/save';
import { renderTemplate, renderTemplateDeep } from './template';
import { applyMapping, type ResponseMapping } from './mapping';
import { applyAuth, unsealAuth, maskHeadersForLog, type AuthConfig } from './auth';

export type RunIntegrationInput = {
  organizationId: string;
  integrationId: string;
  ticketId: string | null;
  triggeredBy: string;
  triggeredByUser?: string | null;
  /** Variáveis extras (ex.: form values). */
  extra?: Record<string, unknown>;
  /** Se true, NÃO persiste enrichment nem evento (modo teste). */
  dryRun?: boolean;
};

export type RunIntegrationResult = {
  runId: string;
  status: RunStatus;
  requestUrl: string;
  requestMethod: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseStatus: number | null;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  mappedData: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number;
  enrichmentId: string | null;
};

const MAX_BODY_TO_PERSIST = 200_000; // ~200KB

export async function runIntegration(input: RunIntegrationInput): Promise<RunIntegrationResult> {
  const integration = await prisma.apiIntegration.findFirst({
    where: { id: input.integrationId, organizationId: input.organizationId, deletedAt: null },
  });
  if (!integration) throw new Error('Integração não encontrada');
  if (!integration.enabled && !input.dryRun) {
    throw new Error('Integração desabilitada');
  }

  // Contexto pra templates
  const ctx = input.ticketId
    ? await buildTicketContext(input.organizationId, input.ticketId, input.extra)
    : { organization: { id: input.organizationId }, now: new Date().toISOString(), ...(input.extra ?? {}) };

  // Compila URL com vars + query params
  const baseUrl = renderTemplate(integration.url, ctx);
  const queryParams: Record<string, string> = {};
  if (integration.queryParams && typeof integration.queryParams === 'object') {
    for (const [k, v] of Object.entries(integration.queryParams as Record<string, unknown>)) {
      if (typeof v === 'string') queryParams[k] = renderTemplate(v, ctx);
      else queryParams[k] = String(v);
    }
  }

  // Headers
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (integration.headers && typeof integration.headers === 'object') {
    for (const [k, v] of Object.entries(integration.headers as Record<string, unknown>)) {
      if (typeof v === 'string') headers[k] = renderTemplate(v, ctx);
      else headers[k] = String(v);
    }
  }

  // Body (POST/PUT/PATCH)
  let body: string | null = null;
  if (['POST', 'PUT', 'PATCH'].includes(integration.method)) {
    if (integration.bodyTemplate !== null && integration.bodyTemplate !== undefined) {
      const rendered = renderTemplateDeep(integration.bodyTemplate, ctx);
      body = JSON.stringify(rendered);
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }
  }

  // Auth (decripta apenas em memória, aplica em headers/queryParams)
  const auth = unsealAuth(
    { ciphertext: integration.authConfigEnc, nonce: integration.authConfigNonce },
    integration.authType,
  );
  applyAuth(auth, headers, queryParams);

  // Adiciona query params à URL
  const finalUrl = appendQueryParams(baseUrl, queryParams);

  // Cria registro de run (pending)
  const run = await prisma.apiIntegrationRun.create({
    data: {
      organizationId: input.organizationId,
      integrationId: integration.id,
      ticketId: input.ticketId,
      triggeredBy: input.triggeredBy,
      triggeredByUser: input.triggeredByUser ?? null,
      status: 'running',
      requestUrl: finalUrl,
      requestMethod: integration.method,
      requestHeaders: maskHeadersForLog(headers) as Prisma.InputJsonValue,
      requestBody: body
        ? (safeJsonParse(body) as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
    select: { id: true },
  });

  const t0 = Date.now();
  try {
    const res = await safeFetch(finalUrl, {
      method: integration.method as 'GET' | 'POST' | 'PUT' | 'PATCH',
      headers,
      body,
      timeoutMs: integration.timeoutMs,
    });

    const responseJson = parseJsonSafe(res.bodyText);
    const responseToStore = res.bodyText.length > MAX_BODY_TO_PERSIST
      ? { _truncated: true, _length: res.bodyText.length }
      : (responseJson ?? { _raw: res.bodyText.slice(0, MAX_BODY_TO_PERSIST) });

    let mappedData: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;
    let status: RunStatus = res.ok ? 'succeeded' : 'failed';

    if (res.ok) {
      try {
        mappedData = applyMapping(
          responseJson ?? {},
          (integration.responseMapping as ResponseMapping) ?? {},
        );
      } catch (err) {
        status = 'failed';
        errorMessage = `mapping_error: ${(err as Error).message}`;
      }
    } else {
      errorMessage = `HTTP ${res.status}`;
    }

    // Required match field — anti-stub guard.
    // Se o admin definiu um campo obrigatório (ex.: "partner.id") e ele veio vazio
    // depois do mapping, considerar que NÃO houve match real. Marca como skipped:
    // não salva enrichment, não dispara ticket_enriched. Usuário fica protegido
    // contra APIs que devolvem 200 + stub genérico em vez de 404.
    if (status === 'succeeded' && integration.requiredMatchField && mappedData) {
      const path = integration.requiredMatchField.trim();
      if (path) {
        const value = getPathFromMapped(mappedData, path);
        if (isEmptyValue(value)) {
          status = 'skipped';
          errorMessage = `required_match_missing: ${path} (resposta veio mas sem o campo — provável "not found" da API)`;
          mappedData = null; // não persistir dado de stub
        }
      }
    }

    const durationMs = Date.now() - t0;

    await prisma.apiIntegrationRun.update({
      where: { id: run.id },
      data: {
        status,
        responseStatus: res.status,
        responseHeaders: res.headers as Prisma.InputJsonValue,
        responseBody: responseToStore as Prisma.InputJsonValue,
        mappedData: mappedData ? (mappedData as Prisma.InputJsonValue) : Prisma.DbNull,
        errorMessage,
        durationMs,
        finishedAt: new Date(),
      },
    });

    let enrichmentId: string | null = null;
    if (status === 'succeeded' && mappedData && input.ticketId && !input.dryRun) {
      const saved = await saveEnrichment({
        organizationId: input.organizationId,
        ticketId: input.ticketId,
        integrationId: integration.id,
        runId: run.id,
        data: mappedData,
      });
      enrichmentId = saved.id;
    }

    logger.info(
      { runId: run.id, integrationId: integration.id, status, durationMs, ticketId: input.ticketId },
      'integration.run done',
    );

    return {
      runId: run.id,
      status,
      requestUrl: finalUrl,
      requestMethod: integration.method,
      requestHeaders: maskHeadersForLog(headers),
      requestBody: body ? safeJsonParse(body) : null,
      responseStatus: res.status,
      responseHeaders: res.headers,
      responseBody: responseJson ?? res.bodyText,
      mappedData,
      errorMessage,
      durationMs,
      enrichmentId,
    };
  } catch (err) {
    const e = err as Error;
    const durationMs = Date.now() - t0;
    const isSsrf = e instanceof SsrfBlockedError;
    const isHttpErr = e instanceof HttpClientError;

    await prisma.apiIntegrationRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        errorMessage: `${isSsrf ? 'ssrf_blocked' : isHttpErr ? 'http_error' : 'unknown'}: ${e.message}`.slice(0, 5000),
        durationMs,
        finishedAt: new Date(),
      },
    });

    // Se falhou por SSRF ou erro de config, marcamos ticket com evento de falha
    if (input.ticketId && !input.dryRun) {
      await prisma.ticketEvent.create({
        data: {
          organizationId: input.organizationId,
          ticketId: input.ticketId,
          type: 'enrichment_failed',
          payload: {
            integrationId: integration.id,
            runId: run.id,
            error: e.message,
          } as Prisma.InputJsonObject,
        },
      });
    }

    logger.warn(
      { runId: run.id, integrationId: integration.id, err: e.message, durationMs },
      'integration.run failed',
    );

    return {
      runId: run.id,
      status: 'failed',
      requestUrl: finalUrl,
      requestMethod: integration.method,
      requestHeaders: maskHeadersForLog(headers),
      requestBody: body ? safeJsonParse(body) : null,
      responseStatus: null,
      responseHeaders: {},
      responseBody: null,
      mappedData: null,
      errorMessage: e.message,
      durationMs,
      enrichmentId: null,
    };
  }
}

/**
 * Lista integrações que devem rodar para um evento (`ticket.created`, etc.) na org,
 * em ordem.
 */
export async function listEnabledForEvent(
  organizationId: string,
  event: string,
): Promise<ApiIntegration[]> {
  const all = await prisma.apiIntegration.findMany({
    where: { organizationId, enabled: true, deletedAt: null },
    orderBy: { runOrder: 'asc' },
  });
  return all.filter((i) => {
    const events = (i.triggerEvents as unknown as string[]) ?? [];
    return Array.isArray(events) && events.includes(event);
  });
}

/**
 * Lookup seguro por dot-path em mappedData. Aceita "partner.id", "partner.brands[0].name".
 * Simples: split por '.', resolve arrays via "[N]" suffix.
 */
function getPathFromMapped(obj: unknown, path: string): unknown {
  if (!path || obj === null || obj === undefined) return undefined;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const raw of parts) {
    const m = raw.match(/^([^[\]]+)(?:\[(\d+)\])?$/);
    if (!m) return undefined;
    const key = m[1];
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
    if (m[2] !== undefined && Array.isArray(cur)) {
      cur = cur[Number(m[2])];
    }
  }
  return cur;
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

function appendQueryParams(url: string, params: Record<string, string>): string {
  if (Object.keys(params).length === 0) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
