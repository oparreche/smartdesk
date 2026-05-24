# 07 — Deploy & Production Checklist

Guia objetivo para subir o SmartDesk em produção. Duas opções viáveis recomendadas — escolha conforme o perfil esperado de carga e o quanto você quer operar.

---

## 1. Escolha de plataforma

### Opção A — Vercel + DB gerenciado (fast path)

Bom para: validação rápida, primeiros clientes, equipe pequena, sem ops dedicado.

| Componente              | Recomendação                                                         |
| ----------------------- | --------------------------------------------------------------------- |
| App                     | **Vercel** (Hobby para teste, Pro a partir do primeiro cliente)       |
| Banco                   | **PlanetScale** (MySQL gerenciado) ou **Railway MySQL**               |
| Storage                 | **Cloudflare R2** (S3-compatible, sem egress fee)                      |
| Cron                    | **Vercel Cron** (pago em Pro; 1min mínimo)                            |
| Email transacional      | **Resend** (notificações ao staff; Gmail conectado faz reply)         |
| Logs/observabilidade    | Vercel logs + **Axiom** ou **Logtail** (Pino → drain)                  |
| Erros                   | **Sentry**                                                            |

**Trade-offs:**
- Timeout de função Vercel: 10s (Hobby), 60s (Pro). Integrações lentas vão falhar. **Mitigação:** já está enfileirado via `integration.run` — runs longas ficam em jobs assíncronos processados por `/api/cron/jobs-tick`. OK no projeto atual.
- Vercel Cron mínimo é 1min e cobra por execução. Para `jobs-tick`, programar 1min é caro mas funcional. Alternativa: extrair workers para um worker Docker separado (Fase 8+).
- Multi-region: Vercel é Edge mas estamos em Node runtime — a função roda na região configurada (default IAD). Para latência LATAM, escolher `gru1` em prod.

### Opção B — VPS Docker (controle total)

Bom para: integrações lentas, controle de custos com volume, ops mais maduro.

| Componente              | Recomendação                                                         |
| ----------------------- | --------------------------------------------------------------------- |
| App                     | Container Docker em **Hetzner CX22** ou **DigitalOcean** (4 GB RAM)   |
| Banco                   | MySQL 8 self-hosted em volume persistente (snapshots diários)         |
| Storage                 | **MinIO** próprio, **Cloudflare R2**, ou S3                            |
| Reverse proxy           | **Caddy** (SSL automático via Let's Encrypt) ou **Nginx + Certbot**   |
| Cron                    | `cron` do host (`*/1 * * * * curl ...`)                                |
| Email transacional      | **Postmark/Resend/Mailgun**                                            |
| Logs                    | Pino → arquivo + **Loki/Grafana** ou rsyslog                          |
| Backups                 | `mysqldump` agendado, jogado pro S3                                    |

**Trade-offs:**
- Você assume responsabilidade por: rotação de certificado, backup do DB, monitoring, security patches.
- Sem timeout por request — integrações lentas funcionam sem ginástica.
- Custo previsível e baixo.

**Recomendação:** comece com **Vercel + PlanetScale** se sua restrição principal é tempo. Migre para VPS na hora que aparecer cliente com workflow pesado de integrações.

---

## 2. Pré-deploy checklist

### Variáveis de ambiente (production)

Copie de `.env.example`, **gere valores novos** (não reuse os de dev):

```bash
NODE_ENV=production
APP_URL=https://seudominio.com

DATABASE_URL="mysql://USER:PASS@host:3306/smartdesk"

# Gerar com `openssl rand -base64 32`
AUTH_SECRET=<NOVO>
AUTH_TRUST_HOST=true       # se atrás de proxy
GOOGLE_CLIENT_ID=<prod-client-id>
GOOGLE_CLIENT_SECRET=<prod-client-secret>
GMAIL_REDIRECT_URI=https://seudominio.com/api/integrations/gmail/connect/callback

# Gerar com `pnpm gen-key`. ⚠️ NÃO REUSAR a chave de dev — backups antigos vão estourar.
# Faça backup desta chave em local separado do DB (vault, gerenciador de senhas).
ENCRYPTION_KEY_BASE64=<NOVO>

# Bearer dos endpoints /api/cron/*
CRON_SECRET=<NOVO>

# Storage
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=smartdesk-attachments
S3_ACCESS_KEY=<prod>
S3_SECRET_KEY=<prod>
S3_FORCE_PATH_STYLE=true

LOG_LEVEL=info
```

### Build local antes do deploy

```bash
pnpm install
pnpm prisma generate
pnpm typecheck
pnpm test
pnpm build
```

Se `pnpm build` quebra (Turbopack vs. lib), tente `next build --webpack` como fallback. Mas resolva o problema — não deixe Turbopack em dev e Webpack em prod.

### Migrations

```bash
# Em production, NUNCA usar `prisma migrate dev`. Apenas:
pnpm prisma migrate deploy
```

Esse comando aplica migrations sem alterar schema baseline. Rode antes de subir nova versão do app (Vercel build step ou release stage do VPS).

---

## 3. Deploy passo a passo — Opção A (Vercel)

1. **Banco**: criar database no PlanetScale → copiar `DATABASE_URL`.
2. **Storage**: criar bucket R2 → access key/secret → URL do endpoint.
3. **Google Cloud Console**: criar Client ID novo de produção (ver [06-gmail-setup.md](./06-gmail-setup.md)) com redirect URI `https://seudominio.com/api/integrations/gmail/connect/callback`.
4. **Vercel**: importar repo → settings → environment variables (todas listadas acima).
5. **Build command**: `pnpm prisma generate && pnpm build`. Install: `pnpm install`. Output: `.next`.
6. **First deploy**: rodar pela primeira vez. Build vai falhar na migration — abrir terminal Vercel (ou rodar local com URL prod):
   ```bash
   DATABASE_URL="..." pnpm prisma migrate deploy
   ```
7. **Re-deploy** com a base migrada — app sobe.
8. **Cron**: settings → cron jobs → adicionar (todos com `Authorization: Bearer ${CRON_SECRET}`):
   - `*/1 * * * *` → `POST /api/cron/jobs-tick`
   - `*/2 * * * *` → `POST /api/cron/gmail-poll`
   - `*/5 * * * *` → `POST /api/cron/sla-tick`
   - `0 * * * *` → `POST /api/cron/cleanup`
9. **Domain**: settings → domains → adicionar.
10. **Seed inicial**: rodar contra prod (com cuidado):
    ```bash
    DATABASE_URL="..." pnpm seed:demo
    ```
    Trocar email/senha do admin imediatamente após login.

---

## 4. Deploy passo a passo — Opção B (VPS Docker)

### Dockerfile (criar em `/Dockerfile`)

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable
RUN pnpm prisma generate
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S smartdesk -u 1001
COPY --from=builder --chown=smartdesk:nodejs /app/.next/standalone ./
COPY --from=builder --chown=smartdesk:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=smartdesk:nodejs /app/public ./public
COPY --from=builder --chown=smartdesk:nodejs /app/prisma ./prisma
COPY --from=builder --chown=smartdesk:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=smartdesk:nodejs /app/node_modules/@prisma ./node_modules/@prisma
USER smartdesk
EXPOSE 3000
CMD ["node", "server.js"]
```

> **Atenção:** habilitar `output: 'standalone'` em `next.config.ts` antes de buildar com esse Dockerfile.

### `next.config.ts`

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
};
```

### docker-compose.prod.yml (exemplo)

```yaml
services:
  app:
    image: ghcr.io/seu-org/smartdesk:latest
    restart: unless-stopped
    env_file: .env.production
    ports:
      - "3000:3000"

  mysql:
    image: mysql:8.0
    restart: unless-stopped
    env_file: .env.production
    volumes:
      - ./data/mysql:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping"]
      interval: 5s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./data/caddy:/data
```

### Caddyfile

```
seudominio.com {
  reverse_proxy app:3000
  encode gzip
  header {
    Strict-Transport-Security "max-age=63072000"
  }
}
```

### Cron do host (crontab -e)

```
*/1 * * * * curl -fsS -X POST https://seudominio.com/api/cron/jobs-tick    -H "Authorization: Bearer $CRON_SECRET" > /dev/null 2>&1
*/2 * * * * curl -fsS -X POST https://seudominio.com/api/cron/gmail-poll   -H "Authorization: Bearer $CRON_SECRET" > /dev/null 2>&1
*/5 * * * * curl -fsS -X POST https://seudominio.com/api/cron/sla-tick     -H "Authorization: Bearer $CRON_SECRET" > /dev/null 2>&1
0   * * * * curl -fsS -X POST https://seudominio.com/api/cron/cleanup      -H "Authorization: Bearer $CRON_SECRET" > /dev/null 2>&1
```

(Carregue `CRON_SECRET` no shell que invoca cron, ou hard-code no script.)

### Backup do banco

```bash
# /etc/cron.daily/smartdesk-backup
#!/bin/bash
ts=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T mysql mysqldump -usmartdesk -p$DB_PASS smartdesk | gzip > /backups/smartdesk-$ts.sql.gz
# Sync para S3/R2
aws s3 cp /backups/smartdesk-$ts.sql.gz s3://meu-backup-bucket/smartdesk/
# Limpa locais com mais de 7 dias
find /backups -name 'smartdesk-*.sql.gz' -mtime +7 -delete
```

---

## 5. Production checklist (revisar antes do go-live)

### Segurança

- [ ] `AUTH_SECRET`, `ENCRYPTION_KEY_BASE64`, `CRON_SECRET` foram **regenerados** (não são os de dev).
- [ ] `ENCRYPTION_KEY_BASE64` está em **vault separado do banco** (perda da chave = todos os secrets de integração inúteis).
- [ ] HTTPS forçado no domínio (HSTS habilitado).
- [ ] Cookie de sessão com `Secure: true` (Auth.js faz isso quando `NODE_ENV=production`).
- [ ] Sem `dangerouslyAllowLocalIP` ativo no `next.config.ts` (Next 16 default já bloqueia).
- [ ] Google OAuth Client ID de produção **não está em modo Testing** (já passou pela verificação Google se usar scope gmail).

### Observabilidade

- [ ] Logs estruturados (Pino JSON) drenando pro provider escolhido (Axiom/Logtail/Datadog).
- [ ] Sentry configurado com `organizationId` como tag (cuidar para não enviar PII).
- [ ] Dashboard de saúde dos crons (Vercel/Grafana) — alerta se `jobs-tick` ficar sem rodar > 5 min.
- [ ] Health endpoint público `/api/health` (criar em Fase 8 — ainda não existe).

### Operação

- [ ] Migrations aplicadas via `prisma migrate deploy`.
- [ ] Backup automatizado do MySQL (diário, retido 30 dias).
- [ ] Cron-jobs do app configurados e validados manualmente uma vez.
- [ ] Rate-limit do login verificado (5+ tentativas erradas → bloqueio).
- [ ] Storage S3 com versionamento habilitado (anti-deleção acidental).

### Compliance / LGPD

- [ ] Privacy policy publicada (URL na home/footer).
- [ ] Termos de uso publicados.
- [ ] Mecanismo de "apagar requester + dados pessoais" disponível (não há no MVP — Fase 8+).
- [ ] DPA assinado com Google se for atender empresas que pedirem.

---

## 6. Pós-deploy — primeiro cliente

1. Criar organização do cliente via Prisma Studio ou via signup (signup não está implementado ainda — Fase 8).
2. Convidar admin do cliente (criar `User` + `OrganizationUser` manualmente). Endpoint de convite fica pra Fase 8.
3. Pedir pro admin do cliente:
   - Conectar Gmail (Configurações → Gmail).
   - Cadastrar a primeira integração HTTP apontando para a API interna deles.
   - Testar via "Testar integração" antes de habilitar.
   - Montar Painel Inteligente.
4. Validar 1 ticket por email + 1 por form chegando como esperado.

---

## 7. Decisões adiadas — em ordem de risco

| Decisão                                              | Quando reabrir                              |
| ---------------------------------------------------- | ------------------------------------------- |
| Workers em processo separado (BullMQ + Redis)        | 1° cliente com volume real (>100 jobs/min)  |
| Migração para PostgreSQL                             | Quando queries JSON viram gargalo           |
| Rotação automática de `ENCRYPTION_KEY_BASE64`        | Antes do 2° cliente pagante                 |
| 2FA para admins                                      | Antes de cliente enterprise                 |
| API pública com keys                                 | Primeiro pedido de integração externa       |
| Multi-region                                         | Quando latência global aparecer em métricas |
| White label / multi-domain                           | Cliente enterprise pedindo                  |

Veja também [docs/05-roadmap.md → Decisões adiadas](./05-roadmap.md#6-decisões-adiadas-com-gatilho).
