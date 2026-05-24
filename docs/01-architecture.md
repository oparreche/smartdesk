# 01 — Arquitetura geral

## 1. Visão de alto nível

```
                           ┌────────────────────────────────────────┐
                           │            NAVEGADOR / CLIENTE          │
                           │   (atendente, admin da org, requester)  │
                           └────────────────┬───────────────────────┘
                                            │ HTTPS
                                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       NEXT.JS APP (App Router)                        │
│                                                                       │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐     │
│   │  React UI    │   │ Server Actions│   │  Route Handlers     │     │
│   │  (RSC + CSR) │   │  (mutations)  │   │  /api/* (REST + cron│     │
│   └──────┬───────┘   └──────┬───────┘   │  + webhooks + form)  │     │
│          │                  │            └──────────┬───────────┘     │
│          ▼                  ▼                       ▼                 │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │     CAMADA DE SERVIÇOS (TS puro, sem dependência de Next)     │   │
│   │  tickets · gmail · integrations · enrichment · layouts · rules│   │
│   │  jobs (worker engine in-process) · audit · auth · storage     │   │
│   └────────────────────────┬─────────────────────────────────────┘   │
│                            │                                          │
│   ┌────────────────────────┴──────────────────────────────────────┐  │
│   │                       PRISMA CLIENT                            │  │
│   └────────────────────────┬──────────────────────────────────────┘  │
└────────────────────────────┼──────────────────────────────────────────┘
                             │
              ┌──────────────┼────────────────┬─────────────────┐
              ▼              ▼                ▼                 ▼
        ┌──────────┐   ┌──────────┐   ┌───────────────┐   ┌──────────┐
        │ MySQL 8  │   │   S3     │   │ Gmail / Google│   │  APIs da │
        │ (Docker  │   │ (MinIO   │   │   OAuth + API │   │  empresa │
        │  local)  │   │  dev)    │   │               │   │ contratan│
        └──────────┘   └──────────┘   └───────────────┘   │   te     │
                                                          └──────────┘

                       ┌──────────────────────────────┐
                       │   CRON EXTERNO (host / k8s)  │
                       │   curl /api/cron/* a cada Nm │
                       └──────────────────────────────┘
```

**Pontos-chave do desenho:**

- Tudo roda dentro de **um único processo Next.js** — UI, API, server actions, worker engine. Decisão consciente para acelerar MVP; ver [Seção 7](#7-fila-in-process-decisão-arriscada-e-como-mitigamos) para o risco.
- **Camada de serviços** isolada de Next — nenhum serviço importa `next/*` ou `react`. Isso preserva opção de extrair para processo dedicado no futuro sem reescrever.
- **Cron externo** dispara endpoints `/api/cron/*` que processam batches da tabela `jobs`. Sem Redis no MVP.
- **Prisma** é o único ponto de acesso ao banco. Toda query passa pelo tenant-guard middleware antes de chegar no MySQL.

---

## 2. Stack final

| Camada                  | Escolha                                       | Versão alvo      | Notas                                                                  |
| ----------------------- | --------------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| Framework               | Next.js (App Router)                          | 15.x             | RSC por padrão, server actions para mutações.                          |
| Linguagem               | TypeScript                                    | 5.x              | `strict: true`. Sem `any` implícito.                                   |
| UI                      | React + TailwindCSS + Shadcn/UI               | React 19         | Shadcn copiado pro projeto, não dependência.                            |
| Forms                   | React Hook Form + Zod                         | últimas          | Validação compartilhada entre client e server actions.                  |
| Data fetching cliente   | TanStack Query                                | 5.x              | Para listas que precisam de paginação/refresh; o resto usa RSC.         |
| Estado                  | Zustand                                       | última           | Mínimo possível. Preferir URL state + server state.                     |
| ORM                     | Prisma                                        | 6.x              | Migrations via `prisma migrate`. Cliente único compartilhado.           |
| Banco                   | MySQL                                         | 8.0              | JSON columns para `payload`, `mapping`, `layout_config`, `enrichment`.  |
| Auth                    | Auth.js (NextAuth v5)                         | 5.x              | Credentials + Google providers. Sessions via JWT em cookie HttpOnly.   |
| Validação               | Zod                                           | 3.x              | Schema de entrada de toda action / route handler.                      |
| Gmail                   | googleapis (Node)                             | última           | OAuth 2.0; refresh token armazenado criptografado.                     |
| HTTP cliente (integr.)  | `undici` (nativo do Node)                     | nativo           | Não usar `axios` — SSRF guard precisa controle fino de DNS/conexão.    |
| JSONPath                | `jsonpath-plus`                               | última           | Para mapear resposta de integrações.                                   |
| Cripto                  | `node:crypto` (AES-256-GCM)                   | nativo           | Chave em env var. Ver [03-modules → secrets](./03-modules.md).         |
| Storage                 | S3 SDK (`@aws-sdk/client-s3`)                 | última           | MinIO em dev, S3/R2 em prod.                                           |
| Email outbound (transac)| Provider SMTP (Resend / SES)                  | —                | Envio via Gmail conectado para respostas; SMTP é só para notificações. |
| Logs                    | `pino` estruturado JSON                       | última           | Cada log carrega `organization_id` quando aplicável.                   |
| Testes                  | Vitest + Playwright                           | últimas          | Unit em serviços, e2e nos fluxos críticos.                             |
| Dev orchestration       | Docker Compose                                | —                | MySQL + MinIO + MailHog para dev local.                                |

---

## 3. Runtime e edge

- **App roda em Node.js**, não Edge. Motivos:
  - Prisma não roda em Edge runtime (no MVP).
  - SSRF guard precisa de DNS lookup e socket control que Edge não dá.
  - Cripto AES-256-GCM precisa Node nativo.
- Algumas rotas estáticas (landing, página pública de form) podem ser pré-renderizadas, mas a regra é: **se toca banco ou integração, é Node**.

---

## 4. Multitenancy — isolamento por `organization_id`

### Regra invariante

> **Toda tabela com dados de tenant tem `organization_id NOT NULL` indexado, e toda query passa por um helper que injeta esse filtro automaticamente.**

### Implementação

1. **Schema:** `organization_id` em toda tabela exceto:
   - `organizations` (é a própria tabela do tenant)
   - `users` (usuário pode ser de várias orgs — relação via `organization_users`)
   - Tabelas de sistema (`audit_logs` cross-org admin, `jobs` se filtrarmos sempre)

2. **Sessão:** ao logar, o usuário pode estar em N organizações. Ele escolhe uma "organização ativa" (cookie + claim no JWT). Toda request server-side lê esse claim.

3. **Tenant context:** `lib/server/tenant.ts` expõe `getOrgContext()` que retorna `{ organizationId, userId, role }`. Lança erro se não houver sessão ou org ativa.

4. **Repositórios:** todos os repositórios recebem `orgId` como primeiro argumento. Não há "Prisma global" — todo acesso é via funções como:
   ```ts
   async function listTickets(orgId: string, filters: TicketFilters) {
     return prisma.ticket.findMany({
       where: { organizationId: orgId, ...buildFilters(filters) },
     });
   }
   ```

5. **Lint custom (opcional, Fase 2):** ESLint rule que proíbe `prisma.<model>.findMany`/`findFirst`/`update`/`delete` sem `organizationId` no where. Bloqueia categoria inteira de bug.

6. **Audit log:** toda mutação registra `organization_id` + `user_id` + `action`. Trilha forense.

### Onde isolamento é fácil de quebrar (atenção redobrada)

- Queries por `id` direto sem o `organizationId` no where (`findUnique({ where: { id } })`). Um atacante que adivinhar UUID acessa o ticket de outro tenant. Sempre usar `findFirst({ where: { id, organizationId } })`.
- Joins via include — Prisma puxa relacionados sem reaplicar filtro. Cuidado em `include: { messages: true }` se o relacionamento permitir cross-org.
- Endpoints públicos (formulário público, callback de OAuth). Estes recebem `organizationId` da URL/slug — validar que existe e está ativa.

---

## 5. Autenticação e autorização

### Stack

- **Auth.js (NextAuth v5)** com dois providers:
  - **Credentials** — email + senha (bcrypt) para login do staff.
  - **Google** — para conectar contas Gmail das organizações (e opcionalmente para login).

### Sessão

- JWT em cookie `HttpOnly`, `Secure`, `SameSite=Lax`.
- Claims: `userId`, `email`, `activeOrganizationId`, `role` (computed da org ativa).
- Troca de organização ativa: server action que reemite sessão.

### RBAC

Quatro papéis no MVP, alinhados ao spec:

| Papel        | Pode                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| `owner`      | Tudo, incluindo deletar a organização e gerenciar billing (futuro).               |
| `admin`      | Configurar integrações, layouts, usuários, regras, Gmail, formulários.            |
| `supervisor` | Ver relatórios, todas as filas, reatribuir tickets, NÃO mexe em config.           |
| `agent`      | Atender tickets das filas que pertence.                                           |
| `viewer`     | Read-only.                                                                        |

Implementação: `lib/server/permissions.ts` com `can(role, action, resource)`. Server actions e route handlers chamam `requirePermission(...)` antes de qualquer mutação.

Permissões são **estáticas no MVP** — não há editor de permissões. Roles custom ficam para Fase 3+.

### 2FA

Não no MVP, mas schema do `users` já reserva `totp_secret` e `totp_enabled_at`. Para não migrar depois.

---

## 6. Segurança transversal (resumo — detalhe em [03-modules.md](./03-modules.md))

| Risco                    | Mitigação obrigatória no MVP                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Vazamento entre tenants  | `organization_id` em toda query (Seção 4).                                                                            |
| SSRF nas integrações     | DNS-resolve antes do connect, bloqueio de RFC1918 + loopback + link-local. Timeouts e limite de tamanho de resposta.  |
| Secrets vazando em log   | Logger com redaction de chaves `password`, `token`, `secret`, `authorization`. Nunca logar body de auth.              |
| Token completo na UI     | Tokens são *write-only* após salvar: API retorna `{ last4: "1234", isSet: true }`. Edit sobrescreve, não exibe.        |
| CSRF                     | Server actions têm proteção nativa do Next; rotas REST exigem token de sessão.                                        |
| Brute-force login        | Rate-limit por IP + por email no endpoint de auth. Fail2ban-style: 5 falhas → 15min lockout.                          |
| HTTPS                    | Obrigatório em prod (proxy reverso/Vercel). Em dev, OK em HTTP.                                                       |
| LGPD                     | Endpoint admin "apagar requester e dados associados" (mantendo audit log com user_id anonimizado).                    |

---

## 7. Fila in-process — decisão arriscada e como mitigamos

O usuário escolheu rodar workers dentro do Next, sem Redis/BullMQ. Isso tem custos reais. Documentamos a abordagem aqui para que ninguém implemente "do jeito errado" mais tarde.

### O problema

Jobs que precisamos rodar:

| Job                            | Frequência     | Latência aceitável | Pode reentrar? |
| ------------------------------ | -------------- | ------------------ | -------------- |
| Polling Gmail                   | a cada 1–2min  | 5 min              | Não — usar lock |
| Execução de integração HTTP     | sob demanda    | 30s                | Sim, idempotente|
| SLA tick (vencimentos)          | a cada 5min    | 1 min              | Sim             |
| Envio de email transacional     | sob demanda    | 10s                | Não — usar dedup|
| Limpeza de jobs antigos         | a cada 1h      | —                  | Sim             |

### A abordagem: tabela `jobs` + cron externo

- Tabela `jobs(id, type, payload JSON, status, run_at, attempts, locked_at, locked_by, last_error)`.
- Status: `pending | running | succeeded | failed | dead`.
- Workers são **funções de serviço** que aceitam `payload` e retornam resultado. Nenhum worker conhece Next.
- Endpoint `/api/cron/tick` é chamado por cron externo (cronjob do host, `*/1 * * * *`):
  1. Faz `UPDATE jobs SET locked_at=NOW(), locked_by=? WHERE status='pending' AND run_at<=NOW() LIMIT N`.
  2. Para cada job, chama o handler correspondente.
  3. Marca `succeeded`/`failed`. Em falha, agenda retry com backoff exponencial (`run_at = NOW() + base * 2^attempts`).
- Lock via `locked_at + locked_by` (UUID do worker) com timeout — se outro tick achar job `running` com `locked_at` antigo, recupera.

### Endpoints de cron

| Endpoint                          | Cadência    | O que faz                                                       |
| --------------------------------- | ----------- | --------------------------------------------------------------- |
| `POST /api/cron/jobs-tick`        | 1m          | Drena fila genérica (integrações, enrichment, email outbound)   |
| `POST /api/cron/gmail-poll`       | 1–2m        | Lista contas Gmail ativas, busca mensagens novas, enfileira     |
| `POST /api/cron/sla-tick`         | 5m          | Verifica SLAs vencidos, dispara alertas/regras                  |
| `POST /api/cron/cleanup`          | 1h          | Apaga jobs `succeeded` > 7 dias, marca `dead` runs travados     |

Todos os endpoints exigem header `Authorization: Bearer ${CRON_SECRET}`.

### Limitações que aceitamos

- **Não há fairness real entre tenants.** Um tenant com 10k jobs vai monopolizar o tick. Mitigação Fase 2: limit por org dentro do tick (`LIMIT 50 per organization_id`).
- **Jobs longos bloqueiam o processo Next.** Mitigação: `MAX_JOB_DURATION = 25s`. Hard timeout cancela. Para integrações lentas, dividir em sub-jobs.
- **Sem fila prioritária.** Mitigação: campo `priority` numérico, ordenado no SELECT do tick.
- **Scale horizontal exige cuidado.** Se rodar 2 instâncias Next, ambas pegarão tick e farão lock no banco. Funciona, mas o lock é otimista — colisões geram retries. Aceitável até Fase 2.
- **Migrar para BullMQ depois é mais fácil do que parece** — handlers já são puros, só trocar o despachante.

---

## 8. Observabilidade

- **Logs estruturados (pino)** em JSON. Todo log carrega:
  ```json
  { "ts": "...", "level": "info", "org": "<id>", "user": "<id>", "req_id": "<uuid>", "msg": "..." }
  ```
- **Request ID** gerado no middleware do Next, propagado nos logs.
- **Métricas (Fase 2):** OpenTelemetry exportando para qualquer backend (Grafana, Datadog).
- **Erros (Fase 2):** Sentry com `organizationId` como tag (cuidar para não vazar PII).
- **Auditoria de produto** vai na tabela `audit_logs`, não no log estruturado — são consumidores diferentes (forense vs ops).

---

## 9. Deploy

### Dev local

```yaml
# docker-compose.yml (resumo do que vai estar em /infra/docker-compose.yml)
services:
  mysql:    # MySQL 8, porta 3306, volume persistente
  minio:    # S3-compatível para anexos, porta 9000
  mailhog:  # SMTP fake para ver emails em dev, porta 8025
```

App roda fora do compose com `pnpm dev`. Cron em dev é simulado por um script (`scripts/dev-cron.ts`) que chama os endpoints a cada N segundos.

### Prod (sugerido — não decidido no MVP)

Duas opções viáveis:

1. **Vercel + PlanetScale/Railway MySQL + Cloudflare R2** — deploy mais simples, cron nativo da Vercel. Cuidado: limite de timeout de função (10s no hobby, 60s pro). Pode quebrar integrações HTTP lentas.
2. **VPS (Hetzner/DigitalOcean) com Docker + nginx + cron do sistema** — controle total, timeout livre, mais trabalho de ops. Recomendado se planeja rodar integrações que demoram >10s.

**Decisão de deploy fica para o fim da Fase 1 — depende de quanto a base de clientes vai pesar.**

---

## 10. Pastas (referência rápida — detalhe em [04-api-and-structure.md](./04-api-and-structure.md))

```
/
├─ app/                       # Next App Router
│  ├─ (auth)/                 # Login, signup, recovery
│  ├─ (dashboard)/            # Área logada
│  │  ├─ tickets/
│  │  ├─ integrations/
│  │  ├─ layouts/             # Painel Inteligente
│  │  ├─ forms/
│  │  ├─ settings/
│  ├─ (public)/               # Páginas públicas de formulário
│  │  └─ f/[slug]/
│  └─ api/
│     ├─ auth/[...nextauth]/
│     ├─ cron/
│     ├─ webhooks/gmail/
│     └─ public/forms/[slug]/
├─ src/
│  ├─ services/               # Camada de serviços (TS puro)
│  │  ├─ tickets/
│  │  ├─ gmail/
│  │  ├─ integrations/
│  │  ├─ enrichment/
│  │  ├─ layouts/
│  │  ├─ rules/
│  │  ├─ jobs/
│  │  └─ audit/
│  ├─ lib/
│  │  ├─ prisma.ts
│  │  ├─ crypto.ts            # AES-256-GCM helpers
│  │  ├─ http-client.ts       # SSRF-safe HTTP
│  │  ├─ jsonpath.ts
│  │  ├─ permissions.ts
│  │  └─ logger.ts
│  └─ components/             # UI (Shadcn-based)
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ scripts/
│  ├─ dev-cron.ts
│  └─ seed.ts
├─ infra/
│  └─ docker-compose.yml
└─ docs/
```

---

## 11. Próximo doc

Veja [02-data-model.md](./02-data-model.md) para o schema completo do banco.
