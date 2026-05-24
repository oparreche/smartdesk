# 05 — Roadmap, backlog e critérios de aceite

## 1. Estratégia de fases

| Fase | Objetivo                                          | Duração estimada | Saída                                                          |
| ---- | ------------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| 0    | Setup e fundações                                 | 3–5 dias          | Repo configurado, MySQL+MinIO subindo, schema inicial migrado. |
| 1    | Núcleo de tickets + auth multitenant              | 1–2 sem           | Login funciona, dá pra criar/listar/responder ticket manualmente. |
| 2    | Formulários públicos                              | 3–5 dias          | Form público cria ticket. Campos custom. Anti-spam básico.     |
| 3    | Gmail (ingestão + envio)                          | 1–2 sem           | Conta Gmail conectada cria/atualiza tickets via polling. Resposta volta por email. |
| 4    | Integrações HTTP + enriquecimento                 | 1–2 sem           | Admin cadastra integração, testa, salva. Roda em `ticket.created`. |
| 5    | Painel Inteligente                                | 1–2 sem           | 5 blocos funcionais. Editor lista vertical. Render no ticket. |
| 6    | Motor de regras                                   | 1 sem             | Regras simples (prioridade, tag, fila) com triggers `ticket.created` e `ticket.enriched`. |
| 7    | Hardening, observabilidade, deploy                | 1 sem             | Logs estruturados, audit log, rate-limit, deploy em ambiente real. |

**Total MVP estimado: 7–10 semanas** para um dev sênior trabalhando focado.

> **Premissa:** uma fase só começa quando a anterior tem critério de aceite cumprido. Não é roadmap "tudo paralelo".

---

## 2. Backlog do MVP (épicos → histórias → critérios)

### Épico 0 — Setup

#### US-0.1 Inicializar projeto Next.js + Prisma + MySQL Docker
- [ ] `pnpm create next-app` (App Router, TS, Tailwind).
- [ ] `docker-compose.yml` em `infra/` com MySQL 8 + MinIO + MailHog.
- [ ] Prisma instalado e configurado para MySQL.
- [ ] `prisma migrate dev --name init` rodando.
- [ ] Script `scripts/gen-key.ts` gera `ENCRYPTION_KEY_BASE64`.
- [ ] `pnpm dev` sobe app em `:3000`; `pnpm dev:cron` simula cron.

**Aceite:** `pnpm dev` + `docker compose up` resulta em app respondendo e MySQL acessível via Prisma Studio.

#### US-0.2 Auth.js (Credentials + Google) + sessões
- [ ] Auth.js v5 com adapter Prisma.
- [ ] Login por email/senha (bcrypt).
- [ ] Login Google (provider configurado).
- [ ] `Session` persistida em DB.
- [ ] `getOrgContext()` em `lib/tenant.ts` retorna `{ organizationId, userId, role }` ou lança.

**Aceite:** usuário consegue logar; rota protegida nega acesso sem sessão (401).

#### US-0.3 Schema completo + seed
- [ ] Todas as entidades de [02-data-model.md](./02-data-model.md) migradas.
- [ ] Seed gera 1 org demo, 2 users (admin + agent), 1 queue default, 1 SLA policy.
- [ ] Comando `pnpm seed:demo`.

**Aceite:** após seed, login como `admin@demo.local` mostra dashboard.

---

### Épico 1 — Núcleo de tickets

#### US-1.1 Modelo de tenancy + troca de organização
- [ ] Middleware (`middleware.ts` do Next) injeta `organizationId` no request via JWT.
- [ ] Server action `setActiveOrganization(orgId)` reemite sessão.
- [ ] UI: dropdown no header lista orgs do usuário.

**Aceite:** usuário com 2 memberships consegue alternar e vê dados distintos.

#### US-1.2 CRUD de filas e tags
- [ ] CRUD básico em `/settings/queues`.
- [ ] CRUD de tags em `/settings/tags` (página simples).
- [ ] Validação: nome único por org.

**Aceite:** admin cria fila "Suporte"; aparece nos filtros e na criação de ticket.

#### US-1.3 Criar ticket manualmente
- [ ] Página `/tickets/new` com form.
- [ ] Server action `createTicketAction`.
- [ ] Geração de `code` `HELP-NNNN` atômica.
- [ ] `TicketEvent` `created` gravado.

**Aceite:** ao criar, redireciona para `/tickets/HELP-100001` e ticket aparece na lista.

#### US-1.4 Listar tickets com filtros
- [ ] `/tickets` com filtros: status, queue, assignee, priority, tag.
- [ ] Busca por código, email do requester, assunto.
- [ ] Paginação cursor-based (Fase 1 pode ser offset; cursor em Fase 2).
- [ ] Coluna SLA com countdown visual.

**Aceite:** lista carrega <500ms com 1000 tickets de seed.

#### US-1.5 Visualizar ticket + responder
- [ ] `/tickets/[code]` mostra: header, conversa, composer.
- [ ] Composer com dois modos: **Resposta pública** (vai para email do requester) e **Nota interna**.
- [ ] Mudança de status/prioridade/assignee inline.
- [ ] Histórico de eventos em aba lateral ou rodapé.
- [ ] Anexos: upload + download.

**Aceite:** agent responde "OK" público; mensagem aparece na conversa com status `pending` e depois `sent` (após Gmail conectado — antes disso, marcamos `not_applicable`).

#### US-1.6 Permissões funcionando
- [ ] Roles: owner, admin, supervisor, agent, viewer.
- [ ] Viewer não vê botão de responder. Agent não acessa `/integrations`. Admin acessa tudo.
- [ ] Helper `requirePermission()` aplicado em todas as actions/routes.

**Aceite:** viewer logado recebe 403 ao tentar criar ticket.

---

### Épico 2 — Formulários públicos

#### US-2.1 Construtor de form
- [ ] `/forms` lista + criar.
- [ ] Editor: adicionar/remover/reordenar campos.
- [ ] Tipos: text, textarea, email, phone, document, select, file.
- [ ] Mapeamento `mapsTo` para campo do ticket/requester.
- [ ] Slug autogerado, editável.

**Aceite:** admin cria form, publica, e `/f/<slug>` renderiza.

#### US-2.2 Submissão pública
- [ ] `POST /api/public/forms/:slug/submit` recebe payload.
- [ ] Anti-spam: honeypot field + rate-limit por IP (5/min).
- [ ] Cria requester (match por email/document).
- [ ] Cria ticket com `origin=form`, queue default, prioridade default.
- [ ] Página de sucesso mostra código.

**Aceite:** submissão cria ticket; rate-limit bloqueia 6ª request em 1 minuto.

---

### Épico 3 — Gmail

#### US-3.1 Conectar conta Gmail
- [ ] `/settings/gmail` lista contas conectadas.
- [ ] Botão "Conectar" → OAuth Google → callback grava `GmailConnection`.
- [ ] Refresh token criptografado.
- [ ] UI mostra status e botão "Desconectar".

**Aceite:** admin conecta `suporte@demo.com`, status `active`.

#### US-3.2 Polling + ingestão
- [ ] `POST /api/cron/gmail-poll` lista conexões e enfileira jobs.
- [ ] `gmail.ingest_message` handler implementado.
- [ ] Identificação de ticket via `[HELP-NNNN]` no subject, fallback In-Reply-To.
- [ ] Anexos baixados e armazenados.
- [ ] Filtros: blacklist por remetente, ignorar auto-submitted.

**Aceite:**
- Email novo para a conta conectada cria ticket em <2min.
- Reply para o mesmo email vira mensagem no ticket existente (não cria novo).
- Email de `noreply@x.com` com `Auto-Submitted: auto-replied` é ignorado.

#### US-3.3 Envio de resposta via Gmail
- [ ] Reply público no ticket usa `users.messages.send` da conta conectada.
- [ ] Subject sempre prefixado com `[HELP-NNNN]`.
- [ ] `In-Reply-To` + `References` preenchidos para threading no cliente.
- [ ] `deliveryStatus` atualizado.

**Aceite:** reply do agent chega no Gmail do requester, na mesma thread.

---

### Épico 4 — Integrações HTTP

#### US-4.1 CRUD de integração
- [ ] `/integrations` lista + criar.
- [ ] Formulário com: nome, método, URL, headers, body, auth (none/api_key_header/api_key_query/bearer/basic), mapeamento JSON.
- [ ] Auth secret salvo cifrado; UI nunca exibe valor após save.
- [ ] Triggers: `ticket.created`, `form.submitted`, `manual.run`.

**Aceite:** admin cadastra integração, salva, recarrega — token aparece como "••••1234".

#### US-4.2 Testar integração
- [ ] Botão "Testar" abre painel com escolha de ticket de exemplo (ou input manual).
- [ ] Mostra: requisição compilada, status retornado, response JSON, mapped data, tempo.
- [ ] Salva `ApiIntegrationRun` com `triggeredBy=manual.test`.

**Aceite:** testar contra API externa real retorna dados em <3s; UI mostra cada etapa.

#### US-4.3 SSRF guard implementado
- [ ] `safeFetch` em `src/lib/http-client.ts` valida URL antes de conectar.
- [ ] Bloqueia loopback, RFC1918, link-local, IPv6 equivalentes.
- [ ] Resolve DNS uma vez, passa IP para o connect.
- [ ] Redirects manuais com revalidação.
- [ ] Tests cobrindo cada faixa bloqueada.

**Aceite:** integração com URL `http://localhost/x` retorna erro claro; teste unitário cobre `127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `::1`.

#### US-4.4 Execução automática + enriquecimento
- [ ] Job `integration.run` enfileirado em `ticket.created` / `form.submitted`.
- [ ] Handler executa, mapeia resposta, salva `TicketEnrichment` (marcando anterior `isCurrent=false`).
- [ ] Emite evento `ticket.enriched`.
- [ ] Falha registra erro em `ApiIntegrationRun` mas não derruba o ticket.

**Aceite:** criar ticket com email cadastrado dispara integração e salva enrichment em <30s.

---

### Épico 5 — Painel Inteligente

#### US-5.1 Editor de layout
- [ ] `/layouts` lista + criar.
- [ ] Editor: adicionar bloco (escolha de tipo), editar via modal, reordenar com ↑↓, remover.
- [ ] Tipos: `info_card`, `metric`, `table`, `alert`, `action_button`.
- [ ] Cada bloco tem editor próprio com Zod-validated form.

**Aceite:** admin monta layout com 4 blocos diferentes, salva, recarrega — config intacta.

#### US-5.2 Preview do layout
- [ ] Botão "Pré-visualizar" abre split-view: editor à esquerda, preview à direita.
- [ ] Preview consome `/api/layouts/preview` com layout + ticketId real.
- [ ] Blocos com `visibleWhen` falso aparecem riscados/cinza (debug-friendly).

**Aceite:** mudar `visibleWhen` no editor atualiza preview ao salvar.

#### US-5.3 Render no ticket
- [ ] `<TicketContextPanel>` no `/tickets/[code]` carrega layout default da org.
- [ ] Resolve `{{vars}}` com contexto (ticket + requester + enrichments).
- [ ] Cada bloco renderiza com seu componente em `src/components/layouts-builder/`.
- [ ] Formatos aplicados (currency BRL, document máscara, badge com cores).

**Aceite:** ticket criado por email com enrichment "partner premium" exibe alert vermelho "Parceiro Premium" na lateral.

---

### Épico 6 — Motor de regras

#### US-6.1 CRUD de regra
- [ ] `/rules` lista + criar.
- [ ] Editor: trigger + conditions (DSL com all/any) + actions.
- [ ] Validação Zod.

**Aceite:** regra "Premium → priority=high" criada e salva.

#### US-6.2 Execução
- [ ] Avaliador de conditions reutiliza o mesmo de `visibleWhen`.
- [ ] Ações: `set_priority`, `set_status`, `add_tag`, `remove_tag`, `assign_queue`, `assign_user`, `add_internal_note`, `add_alert`.
- [ ] Limite de 3 níveis de encadeamento em `run_integration`.
- [ ] Logs em `TicketEvent` `rule_applied`.

**Aceite:** regra dispara no `ticket.enriched`, prioridade muda para `high`, tag `VIP` aplicada.

---

### Épico 7 — Hardening

#### US-7.1 Audit log
- [ ] Helper `audit.log({ action, resourceType, resourceId, diff })` chamado de todas mutações sensíveis.
- [ ] Página `/settings/audit` para admins (filtrar por user, recurso, data).

**Aceite:** mudar prioridade gera linha em `audit_logs`.

#### US-7.2 Logs estruturados + redaction
- [ ] `pino` configurado, formato JSON.
- [ ] Toda request loga `req_id`, `org`, `user`, `path`, `duration_ms`, `status`.
- [ ] Redaction de `password`, `token`, `authorization`, `apiKey`, `refresh_token`.

**Aceite:** rodar `LOG_LEVEL=debug` mostra JSON estruturado; nenhum token aparece em log de teste.

#### US-7.3 Rate-limit
- [ ] Endpoint de login: 5 falhas/15min/email + IP.
- [ ] Endpoint de form público: 5/min/IP.
- [ ] Implementação simples via tabela `rate_limit_hits(key, window, count)` no MySQL (sem Redis). Sliding window aceitável.

**Aceite:** 6ª tentativa de login com senha errada retorna 429.

#### US-7.4 Deploy
- [ ] Escolher: Vercel + DB gerenciado, OU VPS Docker.
- [ ] Pipeline build + migration + deploy.
- [ ] HTTPS obrigatório.
- [ ] Cron externo configurado (Vercel Cron ou cron do host).
- [ ] Domínio com SSL.

**Aceite:** ambiente público acessível, login funciona, ticket de email chega.

---

## 3. Histórias do spec original mapeadas

Garantia de cobertura do que o usuário pediu na seção "Histórias de usuário":

| História do spec                              | Coberta em             |
| ---------------------------------------------- | ---------------------- |
| Admin conecta conta Gmail                      | US-3.1                 |
| Admin cria integração HTTP                     | US-4.1, US-4.2         |
| Admin monta Painel Inteligente                 | US-5.1, US-5.2         |
| Atendente abre ticket e vê dados enriquecidos  | US-5.3                 |
| Supervisor vê tickets por fila                 | US-1.4 + permissões    |

---

## 4. Critérios de qualidade transversais

Estes valem para **toda** história, não são uma fase à parte:

- [ ] Toda rota com `Zod` na entrada.
- [ ] Toda query Prisma filtrada por `organization_id` ou flagrante justificada.
- [ ] Toda mutação sensível gera `audit_log`.
- [ ] Toda funcionalidade nova tem teste unitário no serviço (vitest) cobrindo caminho feliz + 1 erro de borda.
- [ ] Fluxos críticos (criar ticket por email, executar integração, render layout) têm e2e (Playwright).
- [ ] Logs sem PII além do necessário; secrets nunca.
- [ ] Erro do usuário (validação) ≠ erro do servidor (500). Mensagens distintas.

---

## 5. Riscos técnicos

| Risco                                                                          | Impacto | Mitigação                                                                                                |
| ------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------- |
| Cron externo cai → jobs param de processar                                     | Alto    | Endpoint `/api/cron/health` que reporta lag. Alertar quando > 5min sem tick.                              |
| Vazamento entre tenants por query com filtro errado                            | Crítico | ESLint custom rule (Fase 2). Tests de tenant isolation por endpoint.                                     |
| SSRF — admin malicioso da org alvo dispara request para metadata da nossa infra | Crítico | Guard em `safeFetch` testado exaustivamente. Bloqueio em vários níveis (URL, DNS, IP, redirect).         |
| Gmail revoga refresh_token silenciosamente                                     | Médio   | Health check diário, marcar `reauth_required`, notificar admin da org.                                   |
| Resposta de integração quebra parser (HTML em vez de JSON)                     | Médio   | Validar `content-type`. Truncar payload. Log claro do que veio.                                          |
| MySQL JSON queries lentas em escala                                            | Médio   | Indexar campos comuns via colunas geradas. Plano B: migrar pra Postgres na Fase 8+.                      |
| Vercel timeout 10s mata integração lenta                                       | Médio   | Sempre executar integração via job assíncrono, não inline. Não bloquear request do usuário.              |
| Editor de layout salva config inválido → quebra todos os tickets               | Alto    | Validação Zod no save. Em runtime, isolar erro de bloco — não derrubar painel inteiro.                    |
| Loop infinito de regras (rule chama integration que dispara enriched que aciona a regra) | Alto    | Contador no contexto, máximo 3 ciclos. Detecção via flag `__visited` por execução.                       |
| Backup/restore com chave de cripto perdida → todos os secrets inúteis          | Alto    | Documentar processo de backup da chave separado do DB. Considerar KMS quando crescer.                    |

---

## 6. Decisões adiadas (com gatilho)

| Decisão                            | Gatilho                                  |
| ---------------------------------- | ---------------------------------------- |
| Migrar para BullMQ + Redis         | Quando 1 tick demora > 30s OR 100 jobs/min |
| Pub/Sub Gmail                      | Quando latência polling vira queixa real |
| Editor visual drag-drop            | Quando admin reclamar das setas ↑↓        |
| 2FA                                | Antes do primeiro cliente enterprise     |
| API pública (com keys)             | Quando primeiro cliente pedir integração de fora |
| Billing / Stripe                   | Quando tiver 5 contratantes pagos        |
| White label                        | Cliente enterprise pedindo               |
| Mobile app                         | Não previsto. Web mobile-friendly basta. |

---

## 7. Pronto-para-começar

Para a Fase 0 iniciar, precisamos confirmar:

1. **Nome final**: SmartDesk ou HelpTurbo? (Diretório está como HelpTurbo, spec usa SmartDesk.)
2. **Domínio em prod (Fase 7)** — sem urgência, mas pra reservar.
3. **Onde criar projeto no Google Cloud Console** (precisa pra Gmail OAuth). Pode ser deixado para US-3.1.

Tudo o resto está documentado e pronto pra implementar.
