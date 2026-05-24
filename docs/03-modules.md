# 03 — Estratégia dos módulos críticos

Detalhe de implementação dos módulos que carregam o diferencial do produto ou concentram risco técnico. Cada seção responde **"o que é"**, **"como funciona"** e **"o que dá errado se feito de qualquer jeito"**.

## Índice

1. [Conector Gmail](#1-conector-gmail)
2. [Motor de integrações HTTP (com SSRF guard)](#2-motor-de-integrações-http)
3. [Mapeamento JSONPath + enriquecimento](#3-mapeamento-jsonpath--enriquecimento)
4. [Painel Inteligente — schema, render, editor](#4-painel-inteligente)
5. [Motor de regras](#5-motor-de-regras)
6. [Fila in-Next (worker engine)](#6-fila-in-next)
7. [Secrets criptografados](#7-secrets-criptografados)
8. [Storage de anexos](#8-storage-de-anexos)

---

## 1. Conector Gmail

### Modelo OAuth

- Provider Google configurado com escopos:
  - `https://www.googleapis.com/auth/gmail.readonly` — ler mensagens
  - `https://www.googleapis.com/auth/gmail.send` — enviar respostas
  - `https://www.googleapis.com/auth/gmail.modify` — marcar lido / mover label
  - `openid email profile` — identificar a conta
- Após consent, recebemos `refresh_token` + `access_token`. Só o **refresh_token** vai pro banco (criptografado). Access tokens são obtidos sob demanda e mantidos em memória.
- Cada `GmailConnection` é uma conta Gmail conectada (`suporte@empresa.com`). Uma organização pode ter N conexões.

### Ingestão (estratégia)

Duas vias possíveis. **No MVP escolhemos polling com History API**, não Push (Pub/Sub).

| Estratégia          | Prós                                                | Contras                                                                         |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| **History polling** | Simples, sem infra externa.                         | Latência de 1–2 min. Quota de API consumida regularmente.                       |
| Pub/Sub (webhook)   | Tempo real, menos quota.                            | Requer Google Cloud Pub/Sub topic + endpoint público + renovação a cada 7 dias. |

Decisão: polling. Avaliar Pub/Sub na Fase 2 quando volume justificar.

#### Algoritmo do polling (cron a cada 1–2 min)

```
para cada GmailConnection com status=active:
  refreshAccessToken()
  se historyId está salvo:
    pages = users.history.list(startHistoryId=historyId, historyTypes=[messageAdded])
    para cada history:
      para cada messageAdded:
        enqueue job "gmail.ingest_message" { connectionId, messageId }
    salvar último historyId
  senão (primeira sincronia OU historyId expirou):
    pages = users.messages.list(q="newer_than:1d -in:sent")
    para cada messageId:
      enqueue job "gmail.ingest_message" { connectionId, messageId }
    seed historyId via getProfile()
```

#### Algoritmo de ingestão por mensagem (handler do job)

```
1. messages.get(messageId, format="full")
2. extrair headers: Subject, From, To, Cc, Message-ID, In-Reply-To, References, Date
3. aplicar filtros:
   - se From em blacklist da conexão → ignorar (log)
   - se header Auto-Submitted=no, OK; se != no → ignorar (email automático)
   - se domínio ignorado → ignorar
4. identificar ticket existente:
   a. regex /\[HELP-(\d+)\]/ no Subject → procurar Ticket por código na org
   b. se não, procurar em ticket_messages.emailMessageId por In-Reply-To / References
5. resolver requester:
   - findOrCreate Requester por (organizationId, email=From)
6. criar TicketMessage:
   - type=incoming_email
   - bodyHtml + bodyText extraídos do payload (preferir text/plain; sanitizar HTML antes de exibir)
   - emailMessageId, emailInReplyTo, emailReferences
   - emailDirection=inbound
   - authorRequester=requester.id
7. baixar anexos:
   - users.messages.attachments.get → S3 → TicketAttachment
8. se ticket novo:
   - emitir evento "ticket.created" → dispara regras + integrações
9. se ticket existente:
   - emitir evento "ticket.updated" + status retorna para "open" se estava "pending_customer"
10. marcar mensagem com label "SmartDesk/Ingested" (opcional, ajuda diagnosticar)
```

### Envio de resposta

Resposta pública usa `users.messages.send` com:
- `From: suporte@empresa.com` (a conta conectada).
- `To: <requester.email>`.
- `Subject: [HELP-NNNN] <subject>` — sempre prefixar para threading.
- `In-Reply-To` + `References` para juntar na mesma thread no Gmail do cliente.

`TicketMessage.deliveryStatus` muda de `pending` → `sent` / `failed`.

### Falhas conhecidas e tratamento

| Sintoma                                | Causa provável                              | Tratamento                                                                       |
| -------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| `invalid_grant` ao refresh             | Usuário revogou ou senha mudou              | Marcar conexão `reauth_required`, notificar admin da org                         |
| `historyId` retorna 404                | Mais de 7 dias sem polling                  | Resetar historyId, fallback para `messages.list` da última semana                |
| Quota excedida                         | Muito volume                                | Backoff exponencial. Adicionar throttle por conexão (Fase 2).                    |
| Loop de email (auto-resposta nossa)    | Cliente tem auto-reply ativo                | Filtrar `Auto-Submitted`, `Precedence: bulk`, e nosso próprio Message-ID         |

---

## 2. Motor de integrações HTTP

### Princípio

A integração descreve uma chamada HTTP parametrizada. Em runtime, substituímos `{{variáveis}}` por valores do contexto (ticket, requester, form, custom fields), executamos a chamada respeitando SSRF guard, e aplicamos o mapeamento JSONPath sobre a resposta.

### Fluxo de execução (`runIntegration`)

```
1. resolver contexto: { ticket, requester, organization, form?, custom_fields }
2. compilar URL/headers/queryParams/body substituindo {{vars}}
3. validar URL via SSRF guard (ver abaixo)
4. obter credenciais: decrypt(integration.authConfigEnc) — em memória apenas
5. construir requisição HTTP com undici
6. executar com timeout, retries e limite de resposta
7. parsear resposta (esperado JSON; tolerar text/plain pequeno)
8. aplicar responseMapping → mappedData
9. salvar ApiIntegrationRun (com requestHeaders mascarados)
10. salvar TicketEnrichment (markando isCurrent=false o anterior da mesma integração)
11. emitir evento "ticket.enriched" → motor de regras
```

### Variáveis disponíveis no template

```
{{ticket.id}}                  {{ticket.code}}             {{ticket.subject}}
{{ticket.description}}         {{ticket.priority}}         {{ticket.status}}
{{ticket.queue}}               {{ticket.tags}}
{{ticket.requester.email}}     {{ticket.requester.phone}}  {{ticket.requester.document}}
{{ticket.requester.name}}      {{ticket.requester.externalId}}
{{ticket.custom_fields.<key>}}
{{form.<field_key>}}           // só quando triggerEvents inclui form.submitted
{{organization.id}}            {{organization.slug}}
{{now}}                        // ISO 8601 UTC
{{env.<KEY>}}                  // proibido — não permitir leitura de env do servidor!
```

Implementação: parser simples baseado em regex `\{\{([^}]+)\}\}`. Resolução via lookup em objeto plano. Valor ausente → string vazia (configurável: erro vs silêncio).

### SSRF guard — **obrigatório**

A organização contratante define a URL. Isso significa que ela pode (intencionalmente ou por engano) apontar para `http://localhost`, `http://169.254.169.254` (metadata AWS), `http://10.x.x.x` etc. Sem guard, vazamento de credenciais cloud e ataque a serviços internos é trivial.

**Implementação em `src/lib/http-client.ts`:**

```ts
// Pseudocódigo
async function safeFetch(url: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
  if (parsed.port && BLOCKED_PORTS.has(parsed.port)) throw new Error('port');

  // resolve DNS uma vez e valida cada IP
  const addresses = await dns.resolve(parsed.hostname);   // ipv4 + ipv6
  for (const addr of addresses) {
    if (isBlockedAddress(addr)) throw new Error('blocked-ip');
  }

  // forçar conexão para um IP validado (impede DNS rebinding)
  const dispatcher = new undici.Agent({
    connect: { lookup: (h, opts, cb) => cb(null, addresses[0], 4) },
  });

  const res = await undici.fetch(url, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body,
    dispatcher,
    signal: AbortSignal.timeout(opts.timeoutMs),
    redirect: 'manual',  // tratamos redirects à mão para revalidar
  });

  // limitar tamanho da resposta
  return await readWithCap(res, MAX_RESPONSE_BYTES);
}
```

**Lista de IPs bloqueados (`isBlockedAddress`):**

| Faixa                          | Motivo                                          |
| ------------------------------ | ----------------------------------------------- |
| `127.0.0.0/8`                  | Loopback                                        |
| `0.0.0.0/8`                    | Reservado                                       |
| `10.0.0.0/8`                   | RFC 1918                                        |
| `172.16.0.0/12`                | RFC 1918                                        |
| `192.168.0.0/16`               | RFC 1918                                        |
| `169.254.0.0/16`               | Link-local (AWS/GCP metadata!)                  |
| `100.64.0.0/10`                | CGNAT                                           |
| `224.0.0.0/4`                  | Multicast                                       |
| `::1/128`                      | IPv6 loopback                                   |
| `fc00::/7`                     | IPv6 unique local                               |
| `fe80::/10`                    | IPv6 link-local                                 |

**Portas bloqueadas:** SMB(445), MySQL(3306), Postgres(5432), Redis(6379), Memcached(11211), MongoDB(27017), Elasticsearch(9200), SSH(22). Permitir só portas web comuns por padrão (80, 443, 8080, 8443, 8000) — configurável por organização em Fase 2.

**Redirects:** seguir manualmente, no máximo 3, revalidando IP a cada hop. Não confiar em `redirect: 'follow'` do fetch.

**Resposta máxima:** 1 MB. Acima disso, descartar e marcar falha. (Configurável por integração, mas com hard cap de 5 MB.)

**Timeout default:** 10s, max 30s.

### Retry policy

```
attempts = 0
while attempts < integration.maxRetries + 1:
  try executar
  if status em [200, 201, 204]: success
  if status em [400, 401, 403, 422]: fail sem retry (erro de config, não transiente)
  if status em [408, 429, 5xx] ou erro de rede: backoff e retry
backoff = min(60_000ms, 500ms * 2^attempts) + jitter
```

`failurePolicy=skip` apenas registra. `retry_later` agenda outro `Job` com `runAt += 10min`. `flag_ticket` adiciona evento `enrichment_failed` que pode ser exibido como alerta via bloco visível-quando.

### Testar integração antes de salvar

Endpoint `POST /api/integrations/test`:
- Recebe a config completa + um `sampleContext` (o usuário escolhe um ticket de exemplo ou preenche manualmente).
- Executa o pipeline sem persistir nada além de um `ApiIntegrationRun` marcado `triggeredBy="manual.test"`.
- Retorna: requisição, status, resposta crua, mappedData, tempo, erros.
- UI mostra preview lado-a-lado para o admin escolher os JSONPath certos.

---

## 3. Mapeamento JSONPath + enriquecimento

### Sintaxe suportada

Usar `jsonpath-plus`. Subconjunto seguro (sem `$..` ilimitado em respostas grandes, sem expressões JS `?(...)` arbitrárias).

| Expressão                       | Significado                                  |
| ------------------------------- | -------------------------------------------- |
| `$.data.id`                     | Campo direto                                 |
| `$.data.brands`                 | Array inteiro                                |
| `$.data.brands[0].name`         | Item específico                              |
| `$.data.brands[*].name`         | Array de nomes                               |
| `$.data.partner.sales.total`    | Aninhado                                     |

**Bloqueado:** `?(@.foo==1)` (expressões JS executadas), recursive descent profundo, callbacks.

### Estrutura do `responseMapping`

```json
{
  "partner.id":                   "$.data.id",
  "partner.name":                 "$.data.name",
  "partner.status":               "$.data.status",
  "partner.sales_total":          "$.data.sales.total",
  "partner.sales_last_30_days":   "$.data.sales.last_30_days",
  "partner.brands":               "$.data.brands"
}
```

A chave da esquerda é o **alias** que aparecerá nos templates de layout/regra. A direita é o JSONPath.

**Namespacing:** o admin escolhe o prefixo (`partner.*`, `billing.*`, `account.*`). Convenção sugerida — não enforçada — para evitar colisão entre integrações.

### Onde fica salvo

`TicketEnrichment.data` recebe o objeto plano com dot-paths expandidos para árvore:

```json
{
  "partner": {
    "id": 123,
    "name": "João Silva",
    "status": "active",
    "sales_total": 42000,
    "sales_last_30_days": 8500,
    "brands": [{ "name": "Marca A", "sales": 12000 }]
  }
}
```

### Resolução em layouts e regras

No render, o serviço de layout/regra recebe um `context` consolidado:

```ts
const context = {
  ticket: { ... },
  requester: { ... },
  ...mergeAllEnrichments(ticketId),  // espalha partner.*, billing.* etc no topo
};
```

`{{partner.name}}` → `getPath(context, 'partner.name')`. Sem JSONPath em runtime do render (mais simples e seguro).

---

## 4. Painel Inteligente

Esta é a **superfície de personalização** do produto. Precisa ser flexível sem virar uma linguagem de programação.

### Tipos de bloco no MVP

5 tipos, e fim. Resistir a adicionar bloco novo até cliente real pedir.

#### `info_card`

```json
{
  "id": "blk_partner_info",
  "type": "info_card",
  "title": "Dados do parceiro",
  "visibleWhen": { "field": "partner.id", "op": "exists" },
  "fields": [
    { "label": "Nome",      "value": "{{partner.name}}",      "format": "text" },
    { "label": "Status",    "value": "{{partner.status}}",    "format": "badge",
      "badgeMap": { "active": "green", "inactive": "red" } },
    { "label": "Documento", "value": "{{partner.document}}",  "format": "document" }
  ]
}
```

#### `metric`

```json
{
  "id": "blk_sales_30",
  "type": "metric",
  "title": "Vendas (30d)",
  "value": "{{partner.sales_last_30_days}}",
  "format": "currency",
  "currency": "BRL",
  "trend": {
    "value": "{{partner.sales_growth_pct}}",
    "format": "percentage"
  }
}
```

#### `table`

```json
{
  "id": "blk_brands",
  "type": "table",
  "title": "Marcas associadas",
  "source": "{{partner.brands}}",
  "emptyMessage": "Sem marcas",
  "columns": [
    { "label": "Marca",  "value": "name",   "format": "text" },
    { "label": "Vendas", "value": "sales",  "format": "currency", "currency": "BRL" },
    { "label": "Status", "value": "status", "format": "badge" }
  ]
}
```

`source` é um array (vindo de `partner.brands`). `columns[].value` é caminho relativo ao item do array.

#### `alert`

```json
{
  "id": "blk_premium",
  "type": "alert",
  "variant": "warning",
  "message": "Parceiro Premium: atendimento prioritário",
  "icon": "star",
  "visibleWhen": { "field": "partner.type", "op": "eq", "value": "premium" }
}
```

#### `action_button`

```json
{
  "id": "blk_open_in_platform",
  "type": "action_button",
  "label": "Abrir parceiro na plataforma",
  "url": "https://app.empresa.com/parceiros/{{partner.id}}",
  "variant": "primary",
  "openIn": "new_tab"
}
```

### Formatos suportados (resolvidos no render)

| Format       | Resultado                                                       |
| ------------ | --------------------------------------------------------------- |
| `text`       | String simples                                                  |
| `number`     | Intl.NumberFormat('pt-BR')                                      |
| `currency`   | Intl.NumberFormat com `style: currency`, `currency: <param>`    |
| `percentage` | `value * 100`% se 0–1; senão valor% direto. Configurável.       |
| `date`       | `Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })`          |
| `datetime`   | `'pt-BR', { dateStyle: 'short', timeStyle: 'short' }`           |
| `boolean`    | "Sim"/"Não"                                                     |
| `phone`      | máscara (XX) XXXXX-XXXX se 11 dígitos                           |
| `document`   | máscara CPF/CNPJ por contagem de dígitos                        |
| `email`      | Renderiza como link `mailto:`                                   |
| `url`        | Renderiza como link clicável (mesma origem ou allowlist em prod)|
| `badge`      | Pill colorido, cor via `badgeMap` no bloco                      |

### `visibleWhen` (DSL de condição)

```ts
type Condition =
  | { field: string; op: 'exists' | 'not_exists' | 'empty' | 'not_empty' }
  | { field: string; op: 'eq' | 'ne'; value: unknown }
  | { field: string; op: 'gt' | 'gte' | 'lt' | 'lte'; value: number }
  | { field: string; op: 'contains' | 'not_contains'; value: string }
  | { field: string; op: 'in' | 'not_in'; value: unknown[] }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };
```

Mesma DSL é usada em `automation_rules.conditions` (consistência cognitiva e reutilização do avaliador).

### Validação do `config`

Zod schema discriminado em `src/services/layouts/schema.ts`:
- Cada `type` tem schema próprio.
- Recusar layouts inválidos no save.
- Erros mostrados na UI campo-a-campo.

### Editor

UI no MVP: lista vertical de blocos, botão "+ adicionar bloco" abre escolha do tipo, modal de edição para cada bloco com formulário gerado a partir do schema. Sem drag-and-drop livre (Fase 2). Ordem ajustável via setas ↑↓.

Sidebar de preview ao lado mostra como ficará — usa um ticket de exemplo escolhido pelo admin (`/api/layouts/preview` recebe `layoutConfig` + `ticketId`).

### Render no ticket do atendente

Componente `<TicketContextPanel layoutId="..." context={...} />`:
- Carrega layout config.
- Para cada bloco: avalia `visibleWhen` → se falso, oculta.
- Resolve `{{vars}}` → renderiza componente correspondente ao tipo.
- Cada componente recebe **só os dados que precisa**, não o contexto inteiro (evita re-render em cascata).

---

## 5. Motor de regras

### Triggers

| Trigger             | Quando dispara                                                    |
| ------------------- | ----------------------------------------------------------------- |
| `ticket_created`    | Após criar ticket por qualquer origem.                            |
| `ticket_updated`    | Mudança de status, prioridade, assignee, queue, tag.              |
| `ticket_enriched`   | Após qualquer integração finalizar com sucesso.                   |
| `email_received`    | Antes de criar/atualizar ticket — ainda no fluxo de ingestão.     |
| `form_submitted`    | Antes de criar ticket por form (pode rejeitar a submissão).       |

### Estrutura

```json
{
  "name": "Parceiro VIP",
  "trigger": "ticket_enriched",
  "conditions": {
    "all": [
      { "field": "partner.type", "op": "eq", "value": "premium" },
      { "field": "partner.sales_last_30_days", "op": "gt", "value": 50000 }
    ]
  },
  "actions": [
    { "type": "set_priority",  "value": "high" },
    { "type": "add_tag",       "value": "VIP" },
    { "type": "assign_queue",  "queueSlug": "atendimento-vip" },
    { "type": "add_internal_note", "body": "Parceiro VIP detectado automaticamente." }
  ]
}
```

### Ações disponíveis no MVP

- `set_priority` — define prioridade.
- `set_status` — define status (cuidado: validar transição).
- `add_tag` / `remove_tag`.
- `assign_queue` (por slug).
- `assign_user` (por email).
- `add_internal_note` (body suporta `{{vars}}`).
- `add_alert` — adiciona campo `_alerts` no ticket (consumido por bloco `alert` do layout).
- `run_integration` (por id) — encadeia outra integração. Cuidado com loops; detectar via flag `__visitedIntegrations` no contexto.

### Execução

- Carregar regras `enabled` da org filtradas por `trigger`.
- Ordenar por `runOrder ASC`.
- Para cada: avaliar `conditions` com mesmo DSL do `visibleWhen`.
- Se match: executar ações em ordem. Cada ação é uma função pura em `src/services/rules/actions/`.
- Se `stopAfterMatch=true`: parar após primeira regra match.
- Registrar `TicketEvent` `rule_applied` com referência à regra.

### Limites para evitar abuso

- Máximo 50 regras ativas por trigger por org.
- Máximo 10 ações por regra.
- Profundidade de `run_integration` encadeada: 3.
- Tempo máximo de execução do conjunto: 5s (timeout total).

---

## 6. Fila in-Next

Resumo do mecanismo (detalhe em [01-architecture.md § 7](./01-architecture.md)).

### Handlers de job (mapeamento type → função)

Em `src/services/jobs/registry.ts`:

```ts
export const jobRegistry = {
  'gmail.ingest_message': handleGmailIngestMessage,
  'integration.run':      handleIntegrationRun,
  'email.send':           handleEmailSend,
  'sla.check':            handleSlaCheck,
  'rule.run':             handleRuleRun,
  'cleanup.runs':         handleCleanupRuns,
  // ...
} satisfies Record<string, JobHandler>;
```

Cada handler:
- Recebe `{ payload, jobId, organizationId }`.
- Retorna `{ result?: unknown }` em sucesso ou lança erro com `transient: true` para retry.
- Não chama outros handlers diretamente — enfileira jobs novos.

### Endpoint `/api/cron/jobs-tick`

```ts
// app/api/cron/jobs-tick/route.ts
export async function POST(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const workerId = crypto.randomUUID();
  const claimed = await claimJobs(workerId, { batchSize: 20, maxLockSeconds: 60 });

  // executa em paralelo limitado
  await Promise.all(claimed.map(job => runOneJob(job).catch(captureFailure)));

  return Response.json({ processed: claimed.length });
}
```

`claimJobs` é uma transação que `UPDATE jobs SET status='running', locked_at=NOW(), locked_by=? WHERE id IN (...)` selecionando IDs de uma `SELECT ... FOR UPDATE SKIP LOCKED`.

### Recuperação de jobs travados

`/api/cron/cleanup` recupera jobs onde `status=running AND locked_at < NOW() - INTERVAL 5 MINUTE`:
- Se `attempts < maxAttempts`: volta para `pending` com `runAt = NOW() + backoff`.
- Senão: marca `dead`. Alertar admin (notificação interna por enquanto, email em Fase 2).

### Dedup

Para tipos sensíveis (`gmail.ingest_message`), gerar `dedupKey` (`connectionId:messageId`) e ter UNIQUE INDEX em `jobs(type, dedup_key)` — INSERT IGNORE para evitar duplicação. Adicionar coluna `dedupKey VARCHAR(191) NULL` ao schema da tabela `jobs` (não está no modelo atual; adicionar antes da Fase 1 começar).

### Dev mode

Sem cron do sistema. `scripts/dev-cron.ts` faz HTTP POST a cada endpoint em loop:

```ts
setInterval(() => fetch('http://localhost:3000/api/cron/jobs-tick', { ... }), 5000);
```

Roda em paralelo ao `pnpm dev` (`pnpm dev:cron`).

---

## 7. Secrets criptografados

### O problema

Tokens de Gmail (refresh token), credenciais de integração (Bearer, API key, basic auth) **não podem** ir em texto plano para o banco. Se o DB vaza ou um backup é exposto, está tudo comprometido.

### Solução: AES-256-GCM com chave fora do banco

```ts
// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY = Buffer.from(env.ENCRYPTION_KEY_BASE64, 'base64');  // 32 bytes
if (KEY.length !== 32) throw new Error('ENCRYPTION_KEY_BASE64 must decode to 32 bytes');

export function encrypt(plain: string): { ciphertext: string; nonce: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, nonce);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // formato salvo: nonce_base64 + payload combinado (cipher || tag)
  return {
    ciphertext: Buffer.concat([enc, tag]).toString('base64'),
    nonce: nonce.toString('base64'),
  };
}

export function decrypt(ciphertext: string, nonce: string): string {
  const nonceBuf = Buffer.from(nonce, 'base64');
  const combined = Buffer.from(ciphertext, 'base64');
  const tag = combined.subarray(combined.length - 16);
  const enc = combined.subarray(0, combined.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', KEY, nonceBuf);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}
```

### Gestão de chave

- `ENCRYPTION_KEY_BASE64` em variável de ambiente. **Nunca no git.**
- Em dev, gerada uma vez e salva em `.env.local` (gitignored).
- Em prod, vault do provider (Vercel Env, Doppler, AWS Secrets Manager).
- Rotação: schema preparado para `keyId` no payload (Fase 2). MVP usa chave única — documentar como riscos aceitos.

### Onde aplica

| Recurso                                | Campo cifrado                                  |
| -------------------------------------- | ---------------------------------------------- |
| `gmail_connections.refresh_token`      | `refreshTokenEnc` + `refreshTokenNonce`        |
| `api_integrations.authConfig`          | `authConfigEnc` + `authConfigNonce`            |
| `users.password_hash`                  | bcrypt (não AES — função one-way)              |
| `sessions.token_hash`                  | SHA-256 (não reversível)                       |

### Regras de exibição

- API de leitura de integração nunca devolve campo cifrado. Devolve:
  ```json
  { "authType": "bearer", "hasAuth": true, "tokenLast4": "abcd" }
  ```
- Edição em UI: campo de token vem vazio. Se admin não preencher, mantém o atual. Se preencher, sobrescreve.
- Logs: middleware do `pino` faz redaction de chaves `password`, `token`, `secret`, `authorization`, `refresh_token`, `access_token`, `apiKey`. Nunca logar body de auth.

### Headers no `ApiIntegrationRun.requestHeaders`

Antes de salvar, substituir valores de chaves sensíveis por `"***"`. Lista: `authorization`, `x-api-key`, `x-auth-token`, `cookie`, `proxy-authorization`.

---

## 8. Storage de anexos

### Setup

- MinIO em dev (compose).
- Bucket único `smartdesk-attachments` com prefixo `<org-id>/<ticket-id>/<uuid>-<filename>`.
- Não tornar bucket público. Acesso via URL assinada (`getSignedUrl`) com expiração 15min.

### Upload

- Anexo de ticket por agent (resposta com anexo):
  - Frontend envia ao endpoint `/api/uploads/sign-put` que devolve URL pre-signed.
  - Frontend faz `PUT` direto no MinIO/S3.
  - Após sucesso, frontend chama `/api/tickets/:id/attachments` com metadata.

- Anexo de email (incoming):
  - Worker faz download via Gmail API e PUT no S3 server-side.

### Download

- `/api/attachments/:id/download` valida org/ticket ownership, gera URL assinada, faz 302 redirect.
- Não streaming através do servidor (economia de banda do app).

### Limites no MVP

- 25 MB por arquivo.
- 100 MB total por ticket.
- Tipos permitidos: imagens, pdf, doc/xls, txt, csv, zip. Bloquear `.exe`, `.js`, `.html` (XSS via download direto).

---

## 9. Pontos pendentes / decisões adiadas

| Item                                      | Quando decidir                  |
| ----------------------------------------- | ------------------------------- |
| Migrar para BullMQ + Redis?               | Fim da Fase 2 ou primeiro cliente real |
| Pub/Sub Gmail em vez de polling           | Fase 2                          |
| Rotação de chave de criptografia          | Antes do primeiro cliente pagante|
| Editor drag-and-drop livre do layout      | Fase 3                          |
| IA (resumo, classificação, sugestão)      | Pós-MVP, módulo separado        |
| 2FA                                       | Fase 2                          |
| Pub keys / webhooks de saída             | Fase 2                          |

---

## 10. Próximo doc

Veja [04-api-and-structure.md](./04-api-and-structure.md) para APIs, route handlers e organização do repositório.
