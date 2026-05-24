#!/bin/sh
set -e

echo "[smartdesk] Aplicando migrations Prisma…"
npx prisma migrate deploy

echo "[smartdesk] Iniciando Next.js em $HOSTNAME:$PORT…"
exec "$@"
