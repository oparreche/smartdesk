import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Renderiza markdown pra HTML. NÃO é seguro pra HTML proveniente de usuário não confiável;
 * uso interno (artigos KB criados por admin).
 */
export function renderMarkdown(input: string): string {
  return marked.parse(input, { async: false }) as string;
}
