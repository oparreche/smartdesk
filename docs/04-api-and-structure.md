# 04 — APIs e estrutura de pastas

## 1. Estrutura de pastas (detalhada)

```
/
├─ app/                                  # Next.js App Router
│  ├─ layout.tsx
│  ├─ globals.css
│  ├─ (auth)/                            # área não-autenticada
│  │  ├─ login/page.tsx
│  │  ├─ signup/page.tsx
│  │  └─ accept-invite/[token]/page.tsx
│  │
│  ├─ (dashboard)/                       # tudo aqui exige sessão + org ativa
│  │  ├─ layout.tsx                      # shell com sidebar
│  │  ├─ page.tsx                        # home da org (resumo)
│  │  │
│  │  ├─ tickets/
│  │  │  ├─ page.tsx                     # lista
│  │  │  ├─ [code]/page.tsx              # detalhe (acesso por código HELP-NNNN)
│  │  │  └─ new/page.tsx                 # criar manual
│  │  │
│  │  ├─ integrations/
│  │  │  ├─ page.tsx                     # lista
│  │  │  ├─ new/page.tsx                 # criar
│  │  │  └─ [id]/
│  │  │     ├─ page.tsx                  # editar
│  │  │     ├─ runs/page.tsx             # histórico de execuções
│  │  │     └─ test/page.tsx             # tela de teste
│  │  │
│  │  ├─ layouts/                        # Painel Inteligente
│  │  │  ├─ page.tsx
│  │  │  └─ [id]/page.tsx                # editor
│  │  │
│  │  ├─ forms/
│  │  │  ├─ page.tsx
│  │  │  ├─ new/page.tsx
│  │  │  └─ [id]/
│  │  │     ├─ page.tsx                  # editar fields + config
│  │  │     └─ submissions/page.tsx
│  │  │
│  │  ├─ rules/
│  │  │  ├─ page.tsx
│  │  │  └─ [id]/page.tsx
│  │  │
│  │  ├─ settings/
│  │  │  ├─ organization/page.tsx
│  │  │  ├─ users/page.tsx
│  │  │  ├─ queues/page.tsx
│  │  │  ├─ gmail/page.tsx               # conectar contas Gmail
│  │  │  ├─ sla/page.tsx
│  │  │  └─ profile/page.tsx
│  │  │
│  │  └─ reports/                        # mínimo no MVP
│  │     └─ page.tsx
│  │
│  ├─ (public)/                          # rotas sem auth
│  │  └─ f/[slug]/
│  │     ├─ page.tsx                     # form público
│  │     └─ success/[code]/page.tsx
│  │
│  └─ api/
│     ├─ auth/[...nextauth]/route.ts
│     ├─ cron/
│     │  ├─ jobs-tick/route.ts
│     │  ├─ gmail-poll/route.ts
│     │  ├─ sla-tick/route.ts
│     │  └─ cleanup/route.ts
│     ├─ webhooks/
│     │  └─ gmail/route.ts               # placeholder p/ Pub/Sub futuro
│     ├─ public/
│     │  └─ forms/[slug]/submit/route.ts # submissão pública
│     ├─ uploads/sign-put/route.ts
│     ├─ attachments/[id]/download/route.ts
│     │
│     ├─ tickets/
│     │  ├─ route.ts                     # GET list, POST create
│     │  └─ [id]/
│     │     ├─ route.ts                  # GET, PATCH, DELETE
│     │     ├─ messages/route.ts         # POST reply / internal note
│     │     ├─ assign/route.ts
│     │     ├─ status/route.ts
│     │     └─ enrichments/run/route.ts  # disparar integração manualmente
│     │
│     ├─ integrations/
│     │  ├─ route.ts                     # list, create
│     │  ├─ test/route.ts                # testar sem persistir
│     │  └─ [id]/
│     │     ├─ route.ts                  # get, patch, delete
│     │     └─ runs/route.ts
│     │
│     ├─ layouts/
│     │  ├─ route.ts
│     │  └─ [id]/route.ts
│     │  └─ preview/route.ts
│     │
│     ├─ forms/
│     │  ├─ route.ts
│     │  └─ [id]/route.ts
│     │
│     ├─ rules/
│     │  ├─ route.ts
│     │  └─ [id]/route.ts
│     │
│     ├─ requesters/
│     │  ├─ route.ts                     # search
│     │  └─ [id]/route.ts
│     │
│     └─ organizations/
│        ├─ active/route.ts              # POST: trocar org ativa
│        └─ [id]/users/route.ts
│
├─ src/
│  ├─ services/                          # camada de serviços (TS puro)
│  │  ├─ auth/
│  │  ├─ organizations/
│  │  ├─ tickets/
│  │  │  ├─ create.ts
│  │  │  ├─ update.ts
│  │  │  ├─ list.ts
│  │  │  ├─ assign.ts
│  │  │  ├─ messages.ts
│  │  │  ├─ code.ts                      # gerador HELP-NNNN
│  │  │  └─ events.ts
│  │  ├─ requesters/
│  │  ├─ gmail/
│  │  │  ├─ oauth.ts
│  │  │  ├─ poll.ts
│  │  │  ├─ ingest.ts
│  │  │  └─ send.ts
│  │  ├─ integrations/
│  │  │  ├─ run.ts
│  │  │  ├─ test.ts
│  │  │  ├─ template.ts                  # substituição de {{vars}}
│  │  │  └─ mapping.ts                   # JSONPath → árvore
│  │  ├─ enrichment/
│  │  │  ├─ save.ts
│  │  │  └─ context.ts                   # merge para template
│  │  ├─ layouts/
│  │  │  ├─ schema.ts                    # Zod schemas dos blocos
│  │  │  └─ render-prepare.ts            # avalia visibleWhen e resolve vars (SSR)
│  │  ├─ rules/
│  │  │  ├─ run.ts
│  │  │  ├─ eval.ts                      # avaliador de conditions
│  │  │  └─ actions/                     # uma função por ação
│  │  ├─ forms/
│  │  │  ├─ submit.ts
│  │  │  └─ validate.ts
│  │  ├─ jobs/
│  │  │  ├─ enqueue.ts
│  │  │  ├─ claim.ts
│  │  │  ├─ runner.ts
│  │  │  └─ registry.ts
│  │  ├─ sla/
│  │  │  ├─ assign.ts
│  │  │  └─ tick.ts
│  │  ├─ audit/
│  │  │  └─ log.ts
│  │  ├─ storage/
│  │  │  ├─ sign.ts
│  │  │  └─ upload.ts
│  │  └─ notifications/                  # stub no MVP
│  │
│  ├─ lib/                               # primitivas reutilizáveis
│  │  ├─ prisma.ts                       # cliente único
│  │  ├─ crypto.ts                       # AES-256-GCM
│  │  ├─ http-client.ts                  # safeFetch (SSRF guard)
│  │  ├─ jsonpath.ts                     # wrapper restrito
│  │  ├─ template.ts                     # {{var}} parser
│  │  ├─ condition-eval.ts               # DSL avaliador
│  │  ├─ permissions.ts                  # can(role, action, resource)
│  │  ├─ tenant.ts                       # getOrgContext()
│  │  ├─ logger.ts                       # pino
│  │  ├─ env.ts                          # zod.parse(process.env)
│  │  └─ result.ts                       # tipos Result<T, E> opcional
│  │
│  ├─ components/                        # UI compartilhada
│  │  ├─ ui/                             # primitivas Shadcn (button, dialog, etc.)
│  │  ├─ layout/                         # shell, sidebar, header
│  │  ├─ tickets/                        # TicketList, TicketView, ReplyComposer
│  │  ├─ integrations/                   # IntegrationForm, ResponseViewer
│  │  ├─ layouts-builder/                # blocos do Painel Inteligente
│  │  │  ├─ BlockInfoCard.tsx
│  │  │  ├─ BlockMetric.tsx
│  │  │  ├─ BlockTable.tsx
│  │  │  ├─ BlockAlert.tsx
│  │  │  ├─ BlockActionButton.tsx
│  │  │  ├─ ContextPanel.tsx             # renderiza array de blocos
│  │  │  └─ editors/                     # forms para editar cada bloco
│  │  └─ forms-builder/
│  │
│  ├─ hooks/
│  └─ types/
│
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
│
├─ scripts/
│  ├─ dev-cron.ts
│  ├─ seed-demo.ts
│  └─ gen-key.ts                         # gera ENCRYPTION_KEY_BASE64
│
├─ infra/
│  ├─ docker-compose.yml
│  └─ minio-init.sh
│
├─ docs/                                 # você está aqui
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
│
├─ .env.example
├─ .env.local                            # gitignored
├─ next.config.mjs
├─ tsconfig.json
├─ tailwind.config.ts
├─ package.json
└─ pnpm-lock.yaml
```

### Por que `app/` E `src/`

- `app/` é exclusivo da convenção do Next App Router — só arquivos de rota e suas dependências diretas (`page.tsx`, `route.ts`, `layout.tsx`, `loading.tsx`, `error.tsx`).
- `src/` carrega a lógica desacoplada de Next. Permite testar serviços sem instanciar Next, e abre porta para extrair workers no futuro.

---

## 2. Padrão de endpoint REST

Toda rota REST do app segue:

```ts
// app/api/<recurso>/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrgContext } from '@/lib/tenant';
import { requirePermission } from '@/lib/permissions';
import { logger } from '@/lib/logger';

const ListQuery = z.object({
  status: z.string().optional(),
  queueId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();                  // lança 401 se sem sessão
  requirePermission(ctx.role, 'tickets:read');        // lança 403 se sem permissão

  const parsed = ListQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'invalid query', issues: parsed.error.issues }, { status: 400 });

  try {
    const result = await listTickets(ctx.organizationId, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err, org: ctx.organizationId }, 'tickets.list failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
```

### Convenções

- **Sempre Zod** na entrada (`searchParams`, `body`, `params`).
- **Sempre** `getOrgContext()` em rotas do dashboard. Public/cron têm verificação diferente (`slug` + status; `Bearer CRON_SECRET`).
- **Erros padronizados**: `{ error: string, code?: string, issues?: ZodIssue[] }`. Status semântico.
- **Naming**: substantivos no plural, ações via verbo HTTP. Para ações que não mapeiam bem (assign, run), endpoint específico (`/tickets/:id/assign`).

---

## 3. Mutações via Server Actions (preferência da UI interna)

Para mutações disparadas pela UI logada (criar ticket manual, atualizar layout, etc.), preferir **server actions** sobre fetch para `/api/*`. Razões:

- Compartilha o mesmo Zod schema entre client e server.
- Tipagem ponta a ponta (`React.use(action)`).
- Sem JSON serialize/parse manual.
- Sem rota REST que precisamos documentar/expor.

### Quando usar REST (`/api/*`) em vez disso

| Caso                                              | Por quê                                                         |
| ------------------------------------------------- | --------------------------------------------------------------- |
| Endpoints públicos (form submit, OAuth callback)  | Não há sessão.                                                  |
| Cron / webhooks                                   | Chamado por sistema externo.                                    |
| Integrações de terceiros consumindo nossa API     | Contrato REST estável (Fase 2 — emitir API keys).               |
| Upload pre-signed                                 | Resposta é URL externa; melhor REST.                            |
| Download de anexo                                 | Redirect 302.                                                   |

### Padrão de server action

```ts
// src/services/tickets/actions.ts
'use server';
import { z } from 'zod';
import { getOrgContext } from '@/lib/tenant';
import { requirePermission } from '@/lib/permissions';
import { createTicket } from './create';

const Input = z.object({
  subject: z.string().min(1),
  description: z.string().optional(),
  requesterEmail: z.string().email(),
  queueId: z.string().uuid().optional(),
});

export async function createTicketAction(formData: FormData) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:create');
  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  const ticket = await createTicket(ctx.organizationId, ctx.userId, parsed.data);
  return { ok: true, ticket };
}
```

---

## 4. Contratos REST principais (resumo)

Documentação dos endpoints — fonte de verdade do contrato. Detalhe de payload (campos opcionais, validações) vive nas Zod schemas no código.

### Autenticação

| Método | Rota                         | Descrição                              |
| ------ | ---------------------------- | -------------------------------------- |
| POST   | /api/auth/login              | Auth.js Credentials login.             |
| POST   | /api/auth/logout             | Encerra sessão.                        |
| GET    | /api/auth/session            | Sessão atual.                          |
| POST   | /api/organizations/active    | Troca organização ativa do usuário.    |

### Tickets

| Método | Rota                                       | Descrição                              |
| ------ | ------------------------------------------ | -------------------------------------- |
| GET    | /api/tickets                                | Lista com filtros + paginação.         |
| POST   | /api/tickets                                | Cria manualmente.                      |
| GET    | /api/tickets/:id                            | Detalhe.                               |
| PATCH  | /api/tickets/:id                            | Atualiza campos (status, prioridade, queue, tags…). |
| POST   | /api/tickets/:id/messages                   | Envia resposta pública ou nota interna.|
| POST   | /api/tickets/:id/assign                     | Atribui responsável.                   |
| POST   | /api/tickets/:id/status                     | Muda status com validação de transição.|
| POST   | /api/tickets/:id/enrichments/run            | Executa integração específica manualmente. |
| GET    | /api/tickets/:id/events                     | Timeline.                              |

### Integrações HTTP

| Método | Rota                            | Descrição                                |
| ------ | ------------------------------- | ---------------------------------------- |
| GET    | /api/integrations                | Lista.                                   |
| POST   | /api/integrations                | Cria.                                    |
| GET    | /api/integrations/:id            | Detalhe (sem auth secrets).              |
| PATCH  | /api/integrations/:id            | Atualiza.                                |
| DELETE | /api/integrations/:id            | Soft-delete.                             |
| POST   | /api/integrations/test           | Executa em modo teste, não persiste enrichment. |
| GET    | /api/integrations/:id/runs       | Histórico de execuções.                  |

### Layouts (Painel Inteligente)

| Método | Rota                      | Descrição                                  |
| ------ | ------------------------- | ------------------------------------------ |
| GET    | /api/layouts               | Lista.                                     |
| POST   | /api/layouts               | Cria.                                      |
| GET    | /api/layouts/:id           | Detalhe.                                   |
| PATCH  | /api/layouts/:id           | Atualiza config.                           |
| POST   | /api/layouts/preview       | Resolve config + ticketId, retorna blocos prontos para render. |

### Formulários

| Método | Rota                                       | Descrição                              |
| ------ | ------------------------------------------ | -------------------------------------- |
| GET    | /api/forms                                  | Lista.                                 |
| POST   | /api/forms                                  | Cria.                                  |
| GET    | /api/forms/:id                              | Detalhe.                               |
| PATCH  | /api/forms/:id                              | Atualiza.                              |
| POST   | /api/public/forms/:slug/submit              | Submissão pública. Cria ticket.        |

### Regras

| Método | Rota                | Descrição                          |
| ------ | ------------------- | ---------------------------------- |
| GET    | /api/rules           | Lista.                             |
| POST   | /api/rules           | Cria.                              |
| PATCH  | /api/rules/:id       | Atualiza.                          |

### Gmail

| Método | Rota                                  | Descrição                                  |
| ------ | ------------------------------------- | ------------------------------------------ |
| GET    | /api/integrations/gmail/connections    | Lista contas conectadas.                   |
| POST   | /api/integrations/gmail/connect/start  | Inicia OAuth (retorna URL Google).         |
| GET    | /api/integrations/gmail/connect/callback | Callback Google.                         |
| DELETE | /api/integrations/gmail/connections/:id| Desconecta.                                |

### Uploads / Anexos

| Método | Rota                                  | Descrição                              |
| ------ | ------------------------------------- | -------------------------------------- |
| POST   | /api/uploads/sign-put                  | Retorna URL pre-signed PUT.            |
| GET    | /api/attachments/:id/download          | 302 para URL assinada GET.             |

### Cron (interno)

| Método | Rota                       | Auth                          | Cadência    |
| ------ | -------------------------- | ----------------------------- | ----------- |
| POST   | /api/cron/jobs-tick         | `Bearer ${CRON_SECRET}`       | 1 min       |
| POST   | /api/cron/gmail-poll        | `Bearer ${CRON_SECRET}`       | 1–2 min     |
| POST   | /api/cron/sla-tick          | `Bearer ${CRON_SECRET}`       | 5 min       |
| POST   | /api/cron/cleanup           | `Bearer ${CRON_SECRET}`       | 1 hora      |

---

## 5. Erros padronizados

```ts
type ApiError = {
  error: string;                  // 'unauthorized' | 'forbidden' | 'not_found' | 'invalid_input' | 'internal' | ...
  code?: string;                  // código específico do domínio: 'ticket_not_found', 'org_suspended'...
  message?: string;               // mensagem segura p/ exibir ao usuário (sem detalhes internos)
  issues?: { path: (string|number)[]; message: string }[];  // de ZodIssue
};
```

Códigos HTTP:
- 200/201/204 sucesso
- 400 entrada inválida
- 401 não autenticado
- 403 sem permissão
- 404 não encontrado (ou inacessível — propositalmente ambíguo)
- 409 conflito (ex: slug duplicado)
- 422 entrada válida mas regra de negócio bloqueia (ex: transição inválida de status)
- 429 rate-limited
- 5xx interno

---

## 6. Componentes de frontend — convenções

- **Componentes de UI ficam em `src/components/ui/`** (Shadcn). Não importar fora.
- **Componentes de feature** ficam em `src/components/<feature>/`. Eles importam UI e serviços.
- **Server Components** por padrão. Marcar `'use client'` só quando precisa (estado local, hooks de browser, listeners).
- **Não chamar serviço diretamente do client component** — sempre via server action ou fetch para `/api/*`.
- **Composição preferida sobre props gigantes**: `<TicketView>` recebe slots (`leftPane`, `rightPane`) em vez de 30 props.

### Tela do atendente (estrutura)

```
<TicketView>
  <TicketList />            {/* coluna esquerda — lista filtrada */}
  <TicketConversation />    {/* coluna central — mensagens, composer */}
  <TicketContextPanel       {/* coluna direita — Painel Inteligente */}
    layoutId={...}
    context={...}
  />
</TicketView>
```

`TicketContextPanel` é um **Server Component** que carrega layout + enrichments e renderiza HTML estático (rápido, indexável). Os blocos que precisam de interatividade (`action_button`) são client components pequenos.

---

## 7. Variáveis de ambiente

`.env.example` (commitado):

```bash
# App
NODE_ENV=development
APP_URL=http://localhost:3000

# Database
DATABASE_URL="mysql://smartdesk:smartdesk@localhost:3306/smartdesk"

# Auth.js
AUTH_SECRET=                              # gerar com openssl rand -base64 32
AUTH_TRUST_HOST=true                       # em dev
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Cripto
ENCRYPTION_KEY_BASE64=                    # 32 bytes em base64 — scripts/gen-key.ts

# Cron
CRON_SECRET=                              # bearer dos endpoints /api/cron/*

# Storage (S3-compatible)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=smartdesk-attachments
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_FORCE_PATH_STYLE=true

# Gmail OAuth (mesmas creds do Google login se quiser)
GMAIL_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/connect/callback

# Logs
LOG_LEVEL=info
```

`src/lib/env.ts` valida com Zod ao iniciar o app — falha fast se faltar variável.

---

## 8. Próximo doc

Veja [05-roadmap.md](./05-roadmap.md) para o plano de implementação em fases, backlog do MVP e critérios de aceite.
