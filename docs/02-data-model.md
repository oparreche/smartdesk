# 02 — Modelo de dados

Schema Prisma comentado, organizado por domínio. Esta é a fonte da verdade — qualquer divergência em `prisma/schema.prisma` deve refletir uma decisão documentada aqui.

## Convenções

- **IDs:** `String @id @default(uuid()) @db.Char(36)`. UUID v4 em todas as tabelas (CHAR(36) por compatibilidade MySQL).
- **Códigos públicos:** ticket tem `code` legível (`HELP-100001`) além do UUID. Único *por organização*.
- **Timestamps:** `created_at`, `updated_at`. Soft delete via `deleted_at DATETIME?` quando aplicável.
- **`organization_id` em toda tabela de tenant**, sempre indexado e geralmente parte de índice composto.
- **JSON:** MySQL `JSON` para `payload`, `mapping`, `layout_config`, `enrichment_data`, `custom_fields`. JSONPath via `JSON_EXTRACT` (queries server-side só quando necessário; agregações vão para Postgres mais tarde se virar gargalo).
- **Enums:** Prisma `enum` para status fixos (status do ticket, prioridade, role). Strings livres para tags.
- **Nomes:** tabelas no plural snake_case via `@@map`. Campos do Prisma em camelCase mapeados para snake_case no banco com `@map`.

---

## 1. Identidade e tenancy

### `organizations`

Empresa contratante do SmartDesk. Raiz do isolamento.

```prisma
model Organization {
  id          String   @id @default(uuid()) @db.Char(36)
  slug        String   @unique
  name        String
  status      OrgStatus @default(active)
  plan        String   @default("trial")
  ticketSeq   Int      @default(100000)  // gera HELP-<seq+1>
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  members     OrganizationUser[]
  tickets     Ticket[]
  // ... outras relações

  @@map("organizations")
}

enum OrgStatus {
  active
  suspended
  archived
}
```

**Por que `ticketSeq` na própria org:** evita race condition em geração de código sequencial. Atomicamente: `UPDATE organizations SET ticket_seq = ticket_seq + 1 WHERE id = ? RETURNING ticket_seq`. Depois compõe `HELP-<seq>`.

### `users`

Identidade global. Um usuário pode pertencer a várias organizações (mesma pessoa pode trabalhar em duas empresas que contratam o produto).

```prisma
model User {
  id              String   @id @default(uuid()) @db.Char(36)
  email           String   @unique
  emailVerifiedAt DateTime?
  passwordHash    String?  // null se só Google
  name            String
  avatarUrl       String?
  totpSecret      String?  // reservado, não usar no MVP
  totpEnabledAt   DateTime?
  lastLoginAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  memberships     OrganizationUser[]
  sessions        Session[]

  @@map("users")
}
```

### `organization_users` (membership)

Vínculo N:N com role. Uma pessoa pode ser admin numa org e agent em outra.

```prisma
model OrganizationUser {
  id             String   @id @default(uuid()) @db.Char(36)
  organizationId String
  userId         String
  role           OrgRole
  invitedById    String?
  invitedAt      DateTime?
  joinedAt       DateTime?
  status         MembershipStatus @default(active)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization @relation(fields: [organizationId], references: [id])
  user           User         @relation(fields: [userId], references: [id])

  @@unique([organizationId, userId])
  @@index([userId])
  @@map("organization_users")
}

enum OrgRole {
  owner
  admin
  supervisor
  agent
  viewer
}

enum MembershipStatus {
  invited
  active
  suspended
}
```

### `sessions`

Auth.js gerencia sessões por JWT em cookie, mas mantemos esta tabela para:
- Log de logins ativos (para "encerrar sessão" do admin).
- Tracking de `lastSeenAt`.

```prisma
model Session {
  id           String   @id @default(uuid()) @db.Char(36)
  userId       String
  tokenHash    String   @unique
  ip           String?
  userAgent    String?
  createdAt    DateTime @default(now())
  lastSeenAt   DateTime @default(now())
  expiresAt    DateTime
  revokedAt    DateTime?

  user         User     @relation(fields: [userId], references: [id])
  @@index([userId])
  @@map("sessions")
}
```

---

## 2. Catálogos por organização

### `teams`, `queues`, `tags`

Pequenos catálogos que cada org gerencia.

```prisma
model Team {
  id             String   @id @default(uuid()) @db.Char(36)
  organizationId String
  name           String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  organization   Organization @relation(fields: [organizationId], references: [id])
  queues         Queue[]

  @@unique([organizationId, name])
  @@map("teams")
}

model Queue {
  id             String   @id @default(uuid()) @db.Char(36)
  organizationId String
  teamId         String?
  name           String
  slug           String
  description    String?
  isDefault      Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  organization   Organization @relation(fields: [organizationId], references: [id])
  team           Team?        @relation(fields: [teamId], references: [id])
  tickets        Ticket[]

  @@unique([organizationId, slug])
  @@map("queues")
}

model Tag {
  id             String   @id @default(uuid()) @db.Char(36)
  organizationId String
  name           String
  color          String?  // hex
  createdAt      DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id])
  tickets        TicketTag[]

  @@unique([organizationId, name])
  @@map("tags")
}

model TicketTag {
  ticketId String
  tagId    String
  ticket   Ticket @relation(fields: [ticketId], references: [id])
  tag      Tag    @relation(fields: [tagId], references: [id])

  @@id([ticketId, tagId])
  @@map("ticket_tags")
}
```

---

## 3. Solicitantes (requesters)

Quem abre o ticket — não é usuário interno. Tem identificadores soft (email, telefone, documento) e campos custom da organização.

```prisma
model Requester {
  id             String   @id @default(uuid()) @db.Char(36)
  organizationId String
  email          String?
  phone          String?
  document       String?  // CPF/CNPJ — string livre, normalizado pela app
  name           String?
  externalId     String?  // ID do sistema da empresa contratante
  customFields   Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  organization   Organization @relation(fields: [organizationId], references: [id])
  tickets        Ticket[]

  @@index([organizationId, email])
  @@index([organizationId, document])
  @@index([organizationId, externalId])
  @@map("requesters")
}
```

**Política de matching:**
1. Email é o identificador primário em tickets vindos de Gmail.
2. Em forms, matching pode ser email OR document OR externalId — configurável por form.
3. Se nenhum bater, cria requester novo.
4. Merge de requesters fica para Fase 2 (precisa migrar referências em tickets).

---

## 4. Tickets

### `tickets`

```prisma
model Ticket {
  id                  String   @id @default(uuid()) @db.Char(36)
  organizationId      String
  code                String   // "HELP-100001", único por org
  requesterId         String
  assigneeId          String?  // user da org
  queueId             String?
  subject             String
  description         String?  @db.Text
  origin              TicketOrigin
  status              TicketStatus  @default(new)
  priority            TicketPriority @default(normal)
  customFields        Json?

  firstResponseAt     DateTime?
  resolvedAt          DateTime?
  closedAt            DateTime?
  slaPolicyId         String?
  slaFirstResponseDue DateTime?
  slaResolutionDue    DateTime?
  slaBreachedFirst    Boolean  @default(false)
  slaBreachedRes      Boolean  @default(false)

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?

  organization        Organization @relation(fields: [organizationId], references: [id])
  requester           Requester    @relation(fields: [requesterId], references: [id])
  assignee            User?        @relation("AssignedTickets", fields: [assigneeId], references: [id])
  queue               Queue?       @relation(fields: [queueId], references: [id])
  slaPolicy           SlaPolicy?   @relation(fields: [slaPolicyId], references: [id])

  messages            TicketMessage[]
  attachments         TicketAttachment[]
  events              TicketEvent[]
  enrichments         TicketEnrichment[]
  tags                TicketTag[]

  @@unique([organizationId, code])
  @@index([organizationId, status])
  @@index([organizationId, queueId, status])
  @@index([organizationId, assigneeId, status])
  @@index([organizationId, requesterId])
  @@map("tickets")
}

enum TicketStatus {
  new
  open
  in_progress
  pending_customer
  pending_third_party
  resolved
  closed
  cancelled
}

enum TicketPriority {
  low
  normal
  high
  urgent
  critical
}

enum TicketOrigin {
  gmail
  form
  api
  manual
}
```

### `ticket_messages`

Resposta pública (email out) ou comentário interno. Inclui também o que veio de email in.

```prisma
model TicketMessage {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  ticketId        String
  type            MessageType
  authorUserId    String?  // null se vier de requester via email
  authorRequester String?  // id de requester se externo
  bodyHtml        String?  @db.LongText
  bodyText        String?  @db.LongText

  // metadados de email (se aplicável)
  emailMessageId  String?  // Message-ID header
  emailInReplyTo  String?
  emailReferences String?  @db.Text
  emailFrom       String?
  emailTo         String?  @db.Text
  emailCc         String?  @db.Text
  emailBcc        String?  @db.Text
  emailDirection  EmailDirection?

  deliveryStatus  DeliveryStatus @default(pending)
  deliveryError   String?  @db.Text
  sentAt          DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  ticket          Ticket   @relation(fields: [ticketId], references: [id])
  authorUser      User?    @relation(fields: [authorUserId], references: [id])
  attachments     TicketAttachment[]

  @@index([organizationId, ticketId, createdAt])
  @@index([emailMessageId])
  @@map("ticket_messages")
}

enum MessageType {
  public_reply       // vai para o requester por email
  internal_note      // só staff vê
  incoming_email     // veio de Gmail
  system_event       // ex: "ticket criado", "atribuído a X" — duplicação simplificada do events
}

enum EmailDirection {
  inbound
  outbound
}

enum DeliveryStatus {
  pending
  sent
  failed
  not_applicable  // notas internas
}
```

### `ticket_attachments`

Anexos ficam no S3. Tabela guarda metadados.

```prisma
model TicketAttachment {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  ticketId        String
  messageId       String?
  filename        String
  contentType     String
  sizeBytes       Int
  storageKey      String   // chave S3
  uploadedById    String?  // user que subiu (null se veio de email)
  createdAt       DateTime @default(now())

  ticket          Ticket   @relation(fields: [ticketId], references: [id])
  message         TicketMessage? @relation(fields: [messageId], references: [id])

  @@index([organizationId, ticketId])
  @@map("ticket_attachments")
}
```

### `ticket_events`

Histórico append-only. Tudo que muda no ticket vira evento.

```prisma
model TicketEvent {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  ticketId        String
  actorUserId     String?  // null se sistema/automação
  type            TicketEventType
  payload         Json     // ex: { from: "open", to: "in_progress" }
  createdAt       DateTime @default(now())

  ticket          Ticket   @relation(fields: [ticketId], references: [id])

  @@index([organizationId, ticketId, createdAt])
  @@map("ticket_events")
}

enum TicketEventType {
  created
  status_changed
  priority_changed
  assignee_changed
  queue_changed
  tag_added
  tag_removed
  message_added
  enrichment_completed
  rule_applied
  sla_breached
  custom_field_changed
}
```

---

## 5. Gmail

### `gmail_connections`

Conta Gmail conectada por uma organização. Refresh token criptografado.

```prisma
model GmailConnection {
  id                  String   @id @default(uuid()) @db.Char(36)
  organizationId      String
  emailAddress        String
  refreshTokenEnc     String   @db.Text   // AES-256-GCM(refresh_token)
  refreshTokenNonce   String              // nonce do GCM
  scopes              String   @db.Text
  status              GmailConnStatus @default(active)
  historyId           String?             // último historyId processado
  lastSyncedAt        DateTime?
  lastErrorAt         DateTime?
  lastError           String?  @db.Text
  inboundFilterRules  Json?               // whitelist, blacklist, regex etc

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?

  organization        Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, emailAddress])
  @@map("gmail_connections")
}

enum GmailConnStatus {
  active
  reauth_required
  disabled
}
```

**Por que `historyId`:** Gmail API expõe `users.history.list` que retorna apenas mensagens novas desde um historyId. Muito mais eficiente que listar inbox. Fallback para `messages.list` se historyId expirar.

**`refreshTokenEnc`:** ver [03-modules.md → secrets](./03-modules.md).

### Identificação de respostas a ticket existente

Procedimento na ingestão (algoritmo, não schema):
1. Procurar tag `[HELP-NNNN]` no Subject. Se achar e ticket existe, anexar mensagem.
2. Procurar `In-Reply-To` ou `References` em `ticket_messages.emailMessageId`.
3. Se nada bate, criar ticket novo.

---

## 6. Formulários públicos

### `forms`, `form_fields`, `form_submissions`

```prisma
model Form {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  slug            String   // /f/<slug>
  name            String
  description     String?  @db.Text
  isPublished     Boolean  @default(false)
  defaultQueueId  String?
  defaultPriority TicketPriority @default(normal)
  successMessage  String?  @db.Text
  honeypotField   String?  // nome do campo invisível anti-bot
  recaptchaSiteKey String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  organization    Organization @relation(fields: [organizationId], references: [id])
  fields          FormField[]
  submissions     FormSubmission[]

  @@unique([organizationId, slug])
  @@map("forms")
}

model FormField {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  formId          String
  key             String   // identificador estável usado nos mappings
  label           String
  type            FormFieldType
  placeholder     String?
  helpText        String?  @db.Text
  required        Boolean  @default(false)
  position        Int
  options         Json?    // para select/multiselect
  validation      Json?    // { minLength, maxLength, regex, ... }
  mapsTo          String?  // "ticket.subject" | "ticket.description" | "requester.email" | "requester.document" | "custom.<key>"
  visibleWhen     Json?    // condições de exibição

  form            Form     @relation(fields: [formId], references: [id])

  @@unique([formId, key])
  @@index([organizationId, formId])
  @@map("form_fields")
}

enum FormFieldType {
  text
  textarea
  email
  phone
  document
  number
  currency
  date
  select
  multiselect
  checkbox
  file
  url
  hidden
}

model FormSubmission {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  formId          String
  ticketId        String?  // após criar ticket
  rawData         Json     // {key: value}
  ip              String?
  userAgent       String?
  createdAt       DateTime @default(now())

  form            Form     @relation(fields: [formId], references: [id])
  ticket          Ticket?  @relation(fields: [ticketId], references: [id])

  @@index([organizationId, formId, createdAt])
  @@map("form_submissions")
}
```

**`mapsTo`** é a ponte do form para o ticket. Resolução:
- `ticket.subject` / `ticket.description`
- `requester.email` / `requester.phone` / `requester.document` / `requester.name`
- `custom.<key>` → guarda em `ticket.customFields[key]`

---

## 7. Integrações HTTP (motor central de enriquecimento)

### `api_integrations`

```prisma
model ApiIntegration {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  name            String
  description     String?  @db.Text
  enabled         Boolean  @default(true)

  triggerEvents   Json     // ["ticket.created", "form.submitted", "manual.run"]
  conditions      Json?    // expressões para decidir se roda
  runOrder        Int      @default(0)   // ordem entre integrações

  method          HttpMethod
  url             String   @db.Text       // pode conter {{variáveis}}
  headers         Json?                   // headers públicos (sem segredos)
  queryParams     Json?
  bodyTemplate    Json?                   // template do body com {{variáveis}}

  authType        AuthType
  authConfigEnc   String?  @db.Text       // AES-256-GCM da config sensível
  authConfigNonce String?

  timeoutMs       Int      @default(10000)
  maxRetries      Int      @default(2)
  cacheTtlSeconds Int      @default(0)    // 0 = sem cache

  responseMapping Json     // { "partner.id": "$.data.id", ... }
  failurePolicy   FailurePolicy @default(skip)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  organization    Organization @relation(fields: [organizationId], references: [id])
  runs            ApiIntegrationRun[]

  @@index([organizationId, enabled])
  @@map("api_integrations")
}

enum HttpMethod {
  GET
  POST
  PUT
  PATCH
}

enum AuthType {
  none
  api_key_header
  api_key_query
  bearer
  basic
  custom_headers
}

enum FailurePolicy {
  skip            // segue em frente, registra erro
  retry_later     // marca job para retry
  flag_ticket     // adiciona alerta visual no ticket
}
```

**`authConfigEnc`:** o conteúdo varia por tipo. Estrutura interna após decrypt:
- `api_key_header`: `{ "headerName": "X-API-Key", "value": "..." }`
- `bearer`: `{ "token": "..." }`
- `basic`: `{ "username": "...", "password": "..." }`
- `custom_headers`: `{ "headers": { "...": "..." } }`

Nunca devolvido na API de read — só metadata (`hasAuth: true`, `authType: "bearer"`, `keyLast4: "abcd"`).

### `api_integration_runs`

Cada execução de uma integração — para debug, replay e auditoria.

```prisma
model ApiIntegrationRun {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  integrationId   String
  ticketId        String?
  triggeredBy     String   // "ticket.created" | "manual.run" | etc
  triggeredByUser String?
  status          RunStatus

  requestUrl      String   @db.Text
  requestMethod   String
  requestHeaders  Json?    // sem segredos (mascarados antes de salvar)
  requestBody     Json?
  responseStatus  Int?
  responseHeaders Json?
  responseBody    Json?    // armazena truncado se grande
  mappedData      Json?
  errorMessage    String?  @db.Text
  durationMs      Int?
  attempt         Int      @default(1)

  startedAt       DateTime @default(now())
  finishedAt      DateTime?

  integration     ApiIntegration @relation(fields: [integrationId], references: [id])
  ticket          Ticket?  @relation(fields: [ticketId], references: [id])

  @@index([organizationId, integrationId, startedAt])
  @@index([organizationId, ticketId])
  @@map("api_integration_runs")
}

enum RunStatus {
  pending
  running
  succeeded
  failed
  skipped
}
```

**Retenção:** runs > 30 dias podem ser limpos automaticamente, exceto runs com falha (manter 90 dias para debug).

### `ticket_enrichments`

Estado *atual* + histórico dos dados enriquecidos no ticket.

```prisma
model TicketEnrichment {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  ticketId        String
  integrationId   String
  runId           String   // referência ao run que produziu
  data            Json     // dados mapeados (não a resposta crua)
  isCurrent       Boolean  @default(true)
  createdAt       DateTime @default(now())

  ticket          Ticket   @relation(fields: [ticketId], references: [id])

  @@index([organizationId, ticketId, isCurrent])
  @@index([organizationId, ticketId, integrationId, createdAt])
  @@map("ticket_enrichments")
}
```

**Versionamento:** ao chegar enriquecimento novo da mesma integração no mesmo ticket, marca o anterior `isCurrent = false`. O ticket sempre tem 1 enrichment "current" por integração; histórico fica para auditoria.

---

## 8. Painel Inteligente (layout configurável)

### `ticket_layouts`

```prisma
model TicketLayout {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  name            String
  scope           LayoutScope   @default(organization)
  scopeRef        String?       // se scope=queue, queueId; futuro: por categoria etc
  version         Int           @default(1)
  isDefault       Boolean       @default(false)
  config          Json          // árvore completa de blocos
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdById     String?
  deletedAt       DateTime?

  organization    Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId, isDefault])
  @@map("ticket_layouts")
}

enum LayoutScope {
  organization
  queue
}
```

**Por que `config` em JSON em vez de tabelas relacionais (`layout_blocks`):**
- Layout é uma árvore mutável com tipos heterogêneos (card, métrica, tabela). Modelar com 1 tabela por tipo ou 1 tabela polimórfica é dor sem benefício no MVP.
- Edição da UI é "salva o JSON inteiro" — não há consulta granular por bloco fora do contexto do layout.
- Trade-off: não dá pra fazer query "quais layouts usam {{partner.id}}". Aceitável; se virar problema, indexamos os campos referenciados em coluna gerada.

**Estrutura do `config`:**

```json
{
  "blocks": [
    {
      "id": "blk_1",
      "type": "info_card",
      "title": "Dados do parceiro",
      "visibleWhen": { "field": "partner.id", "op": "exists" },
      "fields": [
        { "label": "Nome",   "value": "{{partner.name}}",   "format": "text" },
        { "label": "Status", "value": "{{partner.status}}", "format": "badge" }
      ]
    },
    {
      "id": "blk_2",
      "type": "metric",
      "title": "Vendas (30d)",
      "value": "{{partner.sales_last_30_days}}",
      "format": "currency",
      "currency": "BRL"
    },
    {
      "id": "blk_3",
      "type": "table",
      "title": "Marcas",
      "source": "{{partner.brands}}",
      "columns": [
        { "label": "Marca",  "value": "name" },
        { "label": "Vendas", "value": "sales", "format": "currency" }
      ]
    }
  ]
}
```

Validação do `config` via Zod schema antes de salvar — bloqueia layout inválido. Detalhes em [03-modules.md → Painel Inteligente](./03-modules.md).

---

## 9. Regras de automação

### `automation_rules`

```prisma
model AutomationRule {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String
  name            String
  enabled         Boolean  @default(true)
  trigger         RuleTrigger
  conditions      Json     // array de { field, op, value }
  actions         Json     // array de { type, params }
  runOrder        Int      @default(0)
  stopAfterMatch  Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  organization    Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId, enabled, trigger])
  @@map("automation_rules")
}

enum RuleTrigger {
  ticket_created
  ticket_updated
  ticket_enriched
  email_received
  form_submitted
}
```

Schema dos `conditions` e `actions` definido em [03-modules.md → motor de regras](./03-modules.md).

---

## 10. SLA

### `sla_policies`

```prisma
model SlaPolicy {
  id                  String   @id @default(uuid()) @db.Char(36)
  organizationId      String
  name                String
  description         String?
  // matching
  appliesTo           Json     // { priorities: [...], queues: [...], tags: [...] }
  // metas (em minutos)
  firstResponseMins   Int
  resolutionMins      Int
  businessHours       Json?    // ex: { mon: ["09:00","18:00"], ... }
  timezone            String   @default("America/Sao_Paulo")
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?

  organization        Organization @relation(fields: [organizationId], references: [id])
  tickets             Ticket[]

  @@map("sla_policies")
}
```

**Como atribui:** ao criar/atualizar ticket, motor de SLA escolhe a policy `appliesTo` mais específica. Persistido em `ticket.slaPolicyId` para snapshot. Mudar a policy depois não retroage tickets existentes.

---

## 11. Jobs (fila in-process)

### `jobs`

```prisma
model Job {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String?  // null para jobs de sistema
  type            String   // "integration.run" | "gmail.poll" | "email.send" | ...
  payload         Json
  status          JobStatus @default(pending)
  priority        Int      @default(0)
  runAt           DateTime @default(now())
  attempts        Int      @default(0)
  maxAttempts     Int      @default(5)
  lockedAt        DateTime?
  lockedBy        String?
  lastError       String?  @db.Text
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  completedAt     DateTime?

  @@index([status, runAt, priority])
  @@index([organizationId, type])
  @@map("jobs")
}

enum JobStatus {
  pending
  running
  succeeded
  failed
  dead
}
```

**Lock:** ver [01-architecture.md § 7](./01-architecture.md) para o mecanismo.

---

## 12. Auditoria

### `audit_logs`

```prisma
model AuditLog {
  id              String   @id @default(uuid()) @db.Char(36)
  organizationId  String?  // null se ação cross-org (super admin)
  actorUserId     String?
  action          String   // "integration.created" | "ticket.assignee_changed" | ...
  resourceType    String?  // "ticket" | "integration" | "layout" | ...
  resourceId      String?
  diff            Json?    // { before, after } quando aplicável
  ip              String?
  userAgent       String?
  createdAt       DateTime @default(now())

  @@index([organizationId, createdAt])
  @@index([actorUserId, createdAt])
  @@index([resourceType, resourceId])
  @@map("audit_logs")
}
```

**Retenção:** mínimo 1 ano (LGPD audit trail). Não soft-delete — audit é append-only.

---

## 13. Diagrama resumido de relacionamentos

```
Organization ─┬─ OrganizationUser ─── User
              ├─ Queue ─── Team
              ├─ Tag
              ├─ Requester ─┐
              ├─ Ticket ────┼─ TicketMessage ── TicketAttachment
              │             ├─ TicketEvent
              │             ├─ TicketEnrichment ── ApiIntegration
              │             └─ TicketTag (N:N Tag)
              ├─ Form ── FormField
              │   └─ FormSubmission ─── Ticket
              ├─ GmailConnection
              ├─ ApiIntegration ── ApiIntegrationRun
              ├─ TicketLayout
              ├─ AutomationRule
              └─ SlaPolicy

Job (sistema, opcionalmente vinculado a Org)
AuditLog (sistema, opcionalmente vinculado a Org)
Session (User)
```

---

## 14. Índices que importam (resumo de performance)

| Query frequente                                | Índice                                                  |
| ---------------------------------------------- | ------------------------------------------------------- |
| Lista de tickets por status na org             | `tickets(organization_id, status)`                      |
| Tickets de uma fila                            | `tickets(organization_id, queue_id, status)`            |
| Meus tickets                                   | `tickets(organization_id, assignee_id, status)`         |
| Tickets do requester                           | `tickets(organization_id, requester_id)`                |
| Match de email recebido com ticket             | `ticket_messages(email_message_id)`                     |
| Histórico do ticket                            | `ticket_events(organization_id, ticket_id, created_at)` |
| Enriquecimento current                         | `ticket_enrichments(organization_id, ticket_id, is_current)` |
| Drenar jobs                                    | `jobs(status, run_at, priority)`                        |
| Audit por recurso                              | `audit_logs(resource_type, resource_id)`                |

---

## 15. Próximo doc

Veja [03-modules.md](./03-modules.md) para a implementação dos módulos críticos (Gmail, integrações HTTP, Painel Inteligente, regras, fila in-Next, secrets).
