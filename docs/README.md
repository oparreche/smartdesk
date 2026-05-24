# SmartDesk / HelpTurbo — Documentação de Arquitetura

SaaS multitenant de helpdesk inteligente, com Gmail, formulários, integrações HTTP configuráveis por empresa contratante e **Painel Inteligente** (Construtor de Contexto) que monta a tela do atendente com base em dados externos.

> **Proposta de valor central:** o atendente abre o ticket e já vê todas as informações importantes do cliente, parceiro, vendedor ou usuário, sem precisar pesquisar em outros sistemas.

---

## Como ler estes documentos

Os docs estão numerados na ordem em que se sustentam — comece pelo 01 e prossiga sequencialmente. Cada documento é independente o suficiente para ser revisado isoladamente, mas decisões tomadas em docs anteriores são premissa dos seguintes.

| #   | Documento                                      | Para quem                | O que cobre                                                                                       |
| --- | ---------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| 01  | [Arquitetura geral](./01-architecture.md)      | Time inteiro             | Stack final, runtime, multitenant, segurança transversal, observabilidade, deploy                 |
| 02  | [Modelo de dados](./02-data-model.md)          | Backend, DBA             | Todas as entidades, relacionamentos, índices, schema Prisma comentado                             |
| 03  | [Módulos críticos](./03-modules.md)            | Backend, segurança       | Gmail, integrações HTTP (com SSRF), Painel Inteligente, motor de regras, fila in-Next, secrets    |
| 04  | [APIs e estrutura](./04-api-and-structure.md)  | Frontend, backend        | Route handlers, server actions, contratos REST, organização do repositório                        |
| 05  | [Roadmap MVP](./05-roadmap.md)                 | Produto, time inteiro    | Fases de entrega, backlog do MVP, user stories com critérios de aceite, riscos técnicos           |
| 06  | [Gmail OAuth setup](./06-gmail-setup.md)       | Quem opera o ambiente    | Passo a passo no Google Cloud Console para habilitar conexão Gmail                                |
| 07  | [Deploy & checklist](./07-deploy.md)           | Ops, fundadores          | Vercel vs VPS, ENV vars de produção, cron, backups, checklist pré go-live                         |
| 09  | [WhatsApp setup](./09-whatsapp-setup.md)       | Quem opera o ambiente    | Passo a passo Meta Cloud API: token, webhook, App Secret, troubleshooting                          |

---

## Decisões já travadas

Estas decisões foram aprovadas no início do projeto. Mudá-las depois custa caro — abrir discussão antes de divergir.

| Decisão                | Escolha                                                                | Trade-off conhecido                                                                                          |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Linguagem              | TypeScript em todo lugar                                               | —                                                                                                            |
| Framework              | **Next.js (App Router)** full-stack                                    | Diverge do spec original que pedia NestJS. Aceita-se para acelerar MVP.                                       |
| Banco                  | **MySQL 8** rodando em Docker local                                    | Diverge do spec original (PostgreSQL). MySQL JSON substitui JSONB; JSONPath via `JSON_EXTRACT`.               |
| ORM                    | Prisma                                                                 | Suporta MySQL bem; manter migrations versionadas em git.                                                     |
| Autenticação           | **Auth.js (NextAuth v5)** com Credentials + Google                     | Google é obrigatório para conectar Gmail dos clientes; reusar pro login do staff.                            |
| Filas / Workers        | **Tudo dentro do Next** — sem Redis/BullMQ no MVP                      | **Risco operacional alto.** Ver [03-modules.md → Fila](./03-modules.md) — mitigamos via tabela `jobs` + cron. |
| Multitenancy           | Shared DB + `organization_id` em toda tabela                           | Padrão SaaS. Isolamento via middleware obrigatório em toda query.                                            |
| Anexos                 | S3-compatível (MinIO em dev, S3/R2 em prod)                            | Não armazenar binário no MySQL.                                                                              |
| Idioma da UI           | PT-BR (mercado-alvo)                                                   | Estrutura preparada para i18n no futuro, mas sem fazer i18n no MVP.                                          |

---

## Princípios não-negociáveis

Estas restrições são **invariantes do produto**, não preferências. Qualquer feature que esbarre nelas precisa ser repensada, não burlada.

1. **Isolamento por organização é absoluto.** Toda query precisa filtrar por `organization_id`. Vazamento entre tenants é falha crítica de segurança, não bug.
2. **Secrets de integração são criptografados em repouso** com chave fora do banco. Nunca exibir token completo depois de salvo. Logs não podem vazar segredo.
3. **Integrações HTTP têm guard contra SSRF.** Bloquear `localhost`, redes privadas (RFC 1918), `169.254.0.0/16`, IPv6 link-local. Resolver DNS uma vez e validar IP antes da conexão.
4. **Auditoria de tudo que muda ticket, permissão, integração ou layout.** Append-only.
5. **Dados enriquecidos têm histórico** — não sobrescrever silenciosamente.

---

## Glossário rápido

| Termo                      | Significado                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Organização** / Tenant    | Empresa contratante do SmartDesk. Cada uma tem suas integrações, layouts, usuários, filas próprias.          |
| **Solicitante** (requester) | Pessoa externa que abre o ticket (cliente, parceiro, vendedor da organização contratante).                   |
| **Atendente** (agent)       | Usuário interno da organização contratante que responde tickets.                                             |
| **Integração HTTP**         | Configuração de chamada externa que a organização cadastra (URL, método, auth, mapeamento de resposta).      |
| **Enriquecimento**          | Resultado de uma execução de integração — JSON salvo no ticket com versionamento.                            |
| **Painel Inteligente**      | Construtor visual de blocos (card, métrica, tabela, alerta, botão) que monta a lateral da tela do atendente. |
| **Layout**                  | Configuração persistida do Painel Inteligente — escopo por organização (ou por fila no futuro).              |

---

## O que NÃO está no escopo do MVP

Lembrete explícito do que **não** vamos fazer agora, mesmo se tentador. Veja [05-roadmap.md](./05-roadmap.md) para o quadro completo de fases.

- WhatsApp, chatbot, IA generativa (resumo / sugestão de resposta)
- Marketplace de integrações
- Editor visual estilo Figma (drag-and-drop livre) — começamos com lista vertical de blocos
- Relatórios avançados / BI
- Mobile app
- Billing / cobrança
- White label
- Múltiplos idiomas
- 2FA (preparar terreno, não implementar)
