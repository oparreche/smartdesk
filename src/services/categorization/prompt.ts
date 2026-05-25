export type TagForPrompt = {
  name: string;
  description: string | null;
  keywords: string[];
};

/**
 * System prompt do classificador. Objetivo: confiabilidade — só aplica tags
 * que claramente se encaixam na definição do tenant, e nunca inventa tags.
 */
export const CATEGORIZATION_SYSTEM = [
  'Você é um classificador de tickets de atendimento. Sua tarefa é decidir quais',
  'etiquetas (tags) se aplicam a um ticket, usando EXCLUSIVAMENTE as definições',
  'fornecidas pelo tenant.',
  '',
  'Regras:',
  '1. Só use tags da lista fornecida. Nunca crie nomes de tag novos.',
  '2. Aplique uma tag apenas quando o conteúdo do ticket claramente corresponde',
  '   à descrição daquela tag. Na dúvida, NÃO aplique.',
  '3. Um ticket pode receber várias tags, uma só, ou nenhuma.',
  '4. As palavras-chave são apenas dicas de apoio; a descrição é a fonte da verdade.',
  '5. Ignore assinaturas de email, avisos de confidencialidade e texto repetido de threads.',
  '6. Responda em JSON válido e nada mais, no formato exato:',
  '   {"tags": ["nome-exato-da-tag", ...]}',
  '   Se nenhuma tag se aplicar, responda {"tags": []}.',
].join('\n');

/**
 * Monta a mensagem de usuário: catálogo de tags + conteúdo do ticket.
 */
export function buildCategorizationUserMessage(
  tags: TagForPrompt[],
  ticket: { subject: string; body: string },
): string {
  const catalog = tags
    .map((t) => {
      const lines = [`- Tag: "${t.name}"`];
      if (t.description) lines.push(`  Significado: ${t.description}`);
      if (t.keywords.length) lines.push(`  Palavras-chave (dicas): ${t.keywords.join(', ')}`);
      return lines.join('\n');
    })
    .join('\n');

  const body = ticket.body.slice(0, 6000);

  return [
    'TAGS DISPONÍVEIS:',
    catalog,
    '',
    'TICKET A CLASSIFICAR:',
    `Assunto: ${ticket.subject}`,
    'Conteúdo:',
    body || '(sem conteúdo)',
    '',
    'Responda apenas com o JSON {"tags": [...]}.',
  ].join('\n');
}

/**
 * Extrai os nomes de tag de uma resposta do modelo, tolerante a cercas de código.
 */
export function parseTagsFromResponse(raw: string): string[] {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { tags?: unknown };
    if (!Array.isArray(obj.tags)) return [];
    return obj.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
