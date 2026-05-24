// Stub para o pacote `server-only` em scripts node fora do contexto Next.
// O Next intercepta esse import via webpack/turbopack alias; aqui simulamos.
const Module = require('module');
const path = require('path');
const stubPath = path.join(__dirname, '_noop.cjs');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'server-only') return stubPath;
  return originalResolve.call(this, request, parent, ...rest);
};
