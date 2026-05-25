import 'server-only';

/**
 * Divide texto em chunks de ~targetTokens com overlap.
 * Heurística: 1 token ≈ 4 chars em português. Quebra em parágrafos quando possível.
 */
export function chunkText(
  raw: string,
  opts: { targetTokens?: number; overlapTokens?: number } = {},
): string[] {
  const targetTokens = opts.targetTokens ?? 800;
  const overlapTokens = opts.overlapTokens ?? 80;
  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  const text = raw.replace(/\r\n/g, '\n').replace(/\s+\n/g, '\n').trim();
  if (text.length <= targetChars) return text ? [text] : [];

  // Quebra por parágrafos primeiro
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = '';

  for (const p of paragraphs) {
    const candidate = buf ? `${buf}\n\n${p}` : p;
    if (candidate.length <= targetChars) {
      buf = candidate;
      continue;
    }
    // Flush buf
    if (buf) chunks.push(buf);
    // Se o parágrafo sozinho é maior que target, sub-quebra por sentença
    if (p.length > targetChars) {
      const sentences = p.split(/(?<=[.!?])\s+/);
      let sb = '';
      for (const s of sentences) {
        const c2 = sb ? `${sb} ${s}` : s;
        if (c2.length <= targetChars) {
          sb = c2;
        } else {
          if (sb) chunks.push(sb);
          if (s.length > targetChars) {
            // último recurso: corta por janela
            for (let i = 0; i < s.length; i += targetChars - overlapChars) {
              chunks.push(s.slice(i, i + targetChars));
            }
            sb = '';
          } else {
            sb = s;
          }
        }
      }
      if (sb) chunks.push(sb);
      buf = '';
    } else {
      buf = p;
    }
  }
  if (buf) chunks.push(buf);

  // Aplica overlap: cada chunk começa com o tail do anterior
  if (overlapChars > 0 && chunks.length > 1) {
    const out: string[] = [chunks[0]!];
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!;
      const tail = prev.slice(Math.max(0, prev.length - overlapChars));
      out.push(`${tail}\n\n${chunks[i]}`);
    }
    return out;
  }
  return chunks;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
