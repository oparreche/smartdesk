declare module 'pdf-parse-fork' {
  type ParseResult = { text: string; numpages?: number; info?: unknown; metadata?: unknown };
  function parse(buffer: Buffer): Promise<ParseResult>;
  export default parse;
}
