# SmartDesk

SaaS multitenant de helpdesk inteligente: Gmail, formulários públicos e integrações HTTP configuráveis por empresa contratante. Cada org monta o **Painel Inteligente** (Construtor de Contexto) com blocos que mostram dados externos ao lado da conversa do ticket.

> Para a arquitetura completa, schema, módulos e roadmap, leia [`docs/README.md`](./docs/README.md).

## Stack

| Camada              | Escolha                                 |
| ------------------- | --------------------------------------- |
| Framework           | Next.js 16 (App Router)                 |
| Linguagem           | TypeScript estrito                       |
| Banco               | MySQL 8 via Docker                       |
| ORM                 | Prisma                                   |
| Auth                | Auth.js v5 (Credentials + Google futuro)|
| Storage             | S3 / MinIO em dev                        |
| Fila                | Tabela `jobs` + cron externo (sem Redis)|
| HTTP cliente        | undici com SSRF guard                    |
| JSONPath            | jsonpath-plus                            |

## Dev local em 5 passos

```bash
# 1) deps
pnpm install

# 2) infra (MySQL + MinIO + MailHog)
docker compose -f infra/docker-compose.yml up -d

# 3) env
cp .env.example .env.local
# AUTH_SECRET, ENCRYPTION_KEY_BASE64 e CRON_SECRET já vêm gerados se vc seguir;
# ou rode `pnpm gen-key` e cole em ENCRYPTION_KEY_BASE64.
cp .env.local .env  # Prisma lê .env

# 4) banco
pnpm prisma migrate dev
pnpm seed:demo

# 5) app
pnpm dev               # http://localhost:3000
pnpm dev:cron          # (outro terminal) simula cron
```

Login dev:
- **admin@demo.local** / `admin123` (role admin)
- **agent@demo.local** / `agent123` (role agent)

## Comandos úteis

```bash
pnpm typecheck         # tsc --noEmit
pnpm lint              # eslint
pnpm prisma:studio     # GUI do banco em :5555
pnpm test              # vitest
pnpm gen-key           # gera ENCRYPTION_KEY_BASE64
```

## Estrutura

```
app/         rotas Next (App Router): páginas, route handlers, server actions
src/lib/     primitivas (prisma, env, crypto, logger, tenant, permissions)
src/services/ camada de serviços TS pura, sem dependência de Next
src/components/ UI compartilhada
prisma/      schema + migrations
scripts/     dev-cron, seed-demo, gen-key
infra/       docker-compose
docs/        documentação de arquitetura
auth.ts      Auth.js (NextAuth v5) config raiz
```

Estrutura e contratos detalhados: [`docs/04-api-and-structure.md`](./docs/04-api-and-structure.md).

## Princípios não-negociáveis

1. **Isolamento por organização é absoluto.** Toda query filtra por `organizationId`.
2. **Secrets de integração são criptografados em repouso.** Nunca exibir token completo depois de salvo.
3. **Integrações HTTP têm guard contra SSRF** — RFC1918, loopback, link-local bloqueados.
4. **Auditoria de tudo que muda ticket, permissão, integração ou layout.** Append-only.

## Status do MVP

Fase 0 — Setup [✅ pronto]. Próximo: Fase 1 — Núcleo de tickets (auth multitenant + CRUD + atender). Ver [`docs/05-roadmap.md`](./docs/05-roadmap.md).
