# Deploy do SmartDesk no Easypanel (Hostinger)

Painel: `http://92.113.32.80:3000/` · Projeto: `osvaldo`

## 1. Pré-requisitos no Easypanel

Crie no projeto `osvaldo` os seguintes services antes do app:

### MySQL 8

- Service type: **MySQL**
- Imagem: `mysql:8.4`
- Nome: `smartdesk-db`
- Senha root: gere uma forte
- Banco inicial: `smartdesk`
- Volume persistente: ✓ (default do Easypanel)

Anote a connection string interna que o Easypanel mostra. Vai ser algo como:
```
mysql://root:<senha>@osvaldo_smartdesk-db:3306/smartdesk
```

### MinIO (S3 self-hosted) — opcional, pra anexos

- Service type: **Custom Docker** ou template MinIO
- Imagem: `quay.io/minio/minio`
- Command: `server /data --console-address ":9001"`
- Env: `MINIO_ROOT_USER=minioadmin`, `MINIO_ROOT_PASSWORD=<senha>`
- Port: `9000` (API) e `9001` (console)
- Volume: `/data`

Depois acesse o console MinIO e crie um bucket `smartdesk-attachments`.

> Alternativa: usar **AWS S3** ou **Backblaze B2** com credenciais externas — mais barato em escala mas precisa cadastrar fora.

### MailHog (dev) ou SMTP real (prod)

Pra produção use Resend, SendGrid ou o SMTP do seu provedor. Em dev/teste:

- Service: **Custom Docker**
- Imagem: `mailhog/mailhog`
- Port: `8025` (UI), `1025` (SMTP)

## 2. Deploy do app SmartDesk

### Opção A — Build pelo Git (recomendado)

1. Faça push do código pro GitHub/GitLab
2. No Easypanel: **Create Service → App**
3. Source: **Git**
4. Build method: **Dockerfile** (Easypanel detecta o `Dockerfile` na raiz)
5. Branch: `main` (ou que você usar)
6. Port: `3000`
7. Domain: Easypanel oferece auto-gerar subdomínio HTTPS com Let's Encrypt

### Opção B — Build local + push pra registry

```bash
docker build -t smartdesk:latest .
docker tag smartdesk:latest ghcr.io/seu-user/smartdesk:latest
docker push ghcr.io/seu-user/smartdesk:latest
```

No Easypanel: source = Docker Image → `ghcr.io/seu-user/smartdesk:latest`

## 3. Variáveis de ambiente

No painel do service do SmartDesk, aba **Environment**:

```env
# Core
NODE_ENV=production
APP_URL=https://<seu-subdominio>.easypanel.host

# Database (cole a connection string do MySQL service)
DATABASE_URL=mysql://root:SENHA@osvaldo_smartdesk-db:3306/smartdesk

# Auth (gere com: openssl rand -base64 32)
AUTH_SECRET=COLE_AQUI_32_BYTES_BASE64
AUTH_TRUST_HOST=true

# Encryption (gere com: openssl rand -base64 32)
ENCRYPTION_KEY_BASE64=COLE_AQUI_32_BYTES_BASE64

# Cron (qualquer string forte)
CRON_SECRET=COLE_AQUI_32_BYTES_HEX

# Google OAuth (já configurado, copia do .env.local)
GOOGLE_CLIENT_ID=199515593437-k7rlvd85jh4uk2ktoiindemq7b24sbc1.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GMAIL_REDIRECT_URI=https://<seu-subdominio>.easypanel.host/api/integrations/gmail/connect/callback

# S3/MinIO
S3_ENDPOINT=http://osvaldo_smartdesk-minio:9000
S3_REGION=us-east-1
S3_BUCKET=smartdesk-attachments
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=SENHA_DO_MINIO
S3_FORCE_PATH_STYLE=true

# SMTP (use SMTP real em prod — Resend, SendGrid, etc)
SMTP_HOST=osvaldo_smartdesk-mailhog
SMTP_PORT=1025
SMTP_SECURE=false
EMAIL_FROM=SmartDesk <noreply@seu-dominio>

# IA — Gemini (opcional)
GEMINI_API_KEY=AIzaSyC...
GEMINI_MODEL=gemini-2.5-flash

# Logs
LOG_LEVEL=info
```

> Importante: depois de subir, **vá no Google Cloud Console** e adicione o novo `GMAIL_REDIRECT_URI` na lista de URIs autorizados do client OAuth, senão Gmail vai falhar com `redirect_uri_mismatch`.

## 4. Health check

Easypanel pode usar o endpoint `/api/healthz`:

- Path: `/api/healthz`
- Port: `3000`
- Interval: 30s
- Expected status: 200

## 5. Cron jobs

O sistema usa cron pra:
- Polling Gmail e IMAP a cada 1 min
- Tick de jobs (envio email, integrações) a cada 5s
- Tick de SLA a cada 1 min
- Cleanup a cada 5 min

**Opções no Easypanel:**

### A) Easypanel Schedule (recomendado)

Crie 1 schedule por endpoint, cada um com:
- Image: `curlimages/curl:latest`
- Schedule: cron expression
- Command: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<seu-subdominio>.easypanel.host/api/cron/jobs-tick`

| Endpoint | Cron |
|---|---|
| `/api/cron/jobs-tick` | `* * * * *` (a cada min — depois apertamos pra cada 5s via outro mecanismo) |
| `/api/cron/gmail-poll` | `* * * * *` |
| `/api/cron/imap-poll` | `* * * * *` |
| `/api/cron/sla-tick` | `* * * * *` |
| `/api/cron/cleanup` | `*/5 * * * *` |

### B) Sidecar com dev-cron (mais fácil)

Crie outro service ao lado do app:
- Image: a mesma do SmartDesk
- Command: `node scripts/dev-cron.js` (ou `tsx scripts/dev-cron.ts`)
- Mesmas envs (APP_URL aponta pro service interno: `http://osvaldo_smartdesk:3000`)

## 6. Primeira execução

Após deploy, o `entrypoint.sh` roda `prisma migrate deploy` automaticamente.

Pra criar a primeira organização + usuário admin, acesse a URL pública e use o fluxo `/signup`.

## 7. Updates

Cada push pra `main` faz rebuild + redeploy. Migrations Prisma rodam automaticamente.

## 8. Backup

Easypanel oferece backup automático dos volumes. Pra MySQL, configure backup do volume da DB ao menos diário.

Pra exportar manualmente:
```bash
docker exec osvaldo_smartdesk-db mysqldump -u root -p smartdesk > backup-$(date +%F).sql
```

## 9. Webhooks externos (Meta, Stripe, etc.)

Depois do deploy, seu Callback URL no SmartDesk vira:
`https://<seu-subdominio>.easypanel.host/api/webhooks/whatsapp/<conexao-id>`

Atualize na Meta (WhatsApp Configuration → Webhooks) com essa URL + o Verify token que o SmartDesk gera.

## Troubleshooting

- **502 / health check fail**: confira logs do container. Provavelmente `DATABASE_URL` errado.
- **Prisma migrate falhou**: rode manualmente via `docker exec -it osvaldo_smartdesk sh` → `npx prisma migrate deploy`.
- **Imagens não aparecem**: confira S3_ENDPOINT — Easypanel usa nomes internos tipo `osvaldo_smartdesk-minio`.
- **Email não envia**: SMTP precisa estar acessível do container app.
