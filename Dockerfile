# syntax=docker/dockerfile:1.6

# ─────────────────────────────────────────────
# 1) deps: instala dependências
# ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml .npmrc ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

# ─────────────────────────────────────────────
# 2) builder: build + prisma generate
# ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Gera o Prisma client
RUN npx prisma generate

# Variáveis de build (mockadas — runtime usa as reais)
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

RUN pnpm build

# ─────────────────────────────────────────────
# 3) runner: imagem final mínima
# ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl tini \
  && rm -rf /var/lib/apt/lists/*

# Usuário non-root
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m -s /bin/bash nextjs

# Copia o build standalone (server.js, .next, e parte traced de node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Sobrescreve o node_modules slim do standalone pelo tree completo do pnpm.
# Sem isso, os symlinks pnpm (@prisma/* → .pnpm/...) ficam pendurados porque o
# .pnpm/ não é copiado, e prisma CLI quebra com MODULE_NOT_FOUND no boot.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Entrypoint: roda migrations antes do start
COPY --chown=nextjs:nodejs docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/healthz || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "server.js"]
