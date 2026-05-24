#!/bin/sh
set -e

echo "[smartdesk] Aplicando migrations Prisma…"
# Chamar via node direto evita dependência de node_modules/.bin/prisma,
# que não é copiado pro stage runner.
node ./node_modules/prisma/build/index.js migrate deploy

echo "[smartdesk] Iniciando Next.js em $HOSTNAME:$PORT…"
exec "$@"
