import 'server-only';
import { env } from '@/src/lib/env';
import { logger } from '@/src/lib/logger';

export class AiNotConfiguredError extends Error {
  constructor() {
    super('GEMINI_API_KEY não configurada');
    this.name = 'AiNotConfiguredError';
  }
}

export class AiRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AiRequestError';
  }
}

export function isAiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export type GeminiMessage =
  | { role: 'user'; content: string }
  | { role: 'model'; content: string };

type CompletionInput = {
  system?: string;
  messages: GeminiMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Override por tenant. Se omitido, usa env.GEMINI_API_KEY. */
  apiKey?: string;
  /** Override do model. Se omitido, usa env.GEMINI_MODEL. */
  model?: string;
};

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30_000;

export async function complete(input: CompletionInput): Promise<string> {
  const apiKey = input.apiKey ?? env.GEMINI_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();
  const model = input.model ?? env.GEMINI_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        ...(input.system
          ? { systemInstruction: { parts: [{ text: input.system }] } }
          : {}),
        contents: input.messages.map((m) => ({
          role: m.role,
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature: input.temperature ?? 0.4,
          maxOutputTokens: input.maxTokens ?? 800,
          // Desabilita "thinking mode" do Gemini 2.5 Flash — pra resumir ticket
          // não precisa de raciocínio profundo e o thinking cobra tokens extras.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error({ status: res.status, body: text.slice(0, 500) }, 'gemini API error');
      throw new AiRequestError(res.status, `Gemini ${res.status}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
    };

    if (data.promptFeedback?.blockReason) {
      throw new AiRequestError(400, `Bloqueado: ${data.promptFeedback.blockReason}`);
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();

    if (!text) throw new AiRequestError(500, 'Resposta vazia');
    return text;
  } finally {
    clearTimeout(timer);
  }
}
