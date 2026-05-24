# 06 — Configurando Gmail OAuth

Passo a passo pra deixar o conector Gmail funcionando de verdade (Fase 3). Sem essas creds, o código está pronto mas o `connect Gmail` mostra "OAuth não configurado".

---

## 1. Criar projeto no Google Cloud Console

1. Acesse <https://console.cloud.google.com/>.
2. Crie (ou selecione) um projeto. Sugestão: `smartdesk-dev` para desenvolvimento.

## 2. Habilitar a Gmail API

1. Menu → **APIs & Services → Library**.
2. Procure por **Gmail API** e clique em **Enable**.

## 3. Configurar OAuth consent screen

1. Menu → **APIs & Services → OAuth consent screen**.
2. Escolha **External** (para testes com qualquer conta Gmail) ou **Internal** (Workspace).
3. Preencha:
   - **App name**: SmartDesk Dev
   - **User support email**: seu email
   - **Developer contact**: seu email
4. **Scopes**: adicione manualmente:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `openid`, `email`, `profile`
5. **Test users**: adicione os emails Gmail que você vai conectar no SmartDesk (até o app sair de "Testing").

## 4. Criar credenciais OAuth 2.0 Client ID

1. Menu → **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type**: Web application.
3. **Name**: SmartDesk local.
4. **Authorized redirect URIs**: adicione a URL que está em `GMAIL_REDIRECT_URI` do `.env.local`:
   ```
   http://localhost:3000/api/integrations/gmail/connect/callback
   ```
   Em prod, adicione também `https://seu-dominio.com/api/integrations/gmail/connect/callback`.
5. Crie. Copie **Client ID** e **Client secret**.

## 5. Preencher `.env.local`

```bash
GOOGLE_CLIENT_ID=<colado-do-passo-4>
GOOGLE_CLIENT_SECRET=<colado-do-passo-4>
GMAIL_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/connect/callback
```

Espelhe também em `.env` (Prisma lê de lá) ou simplifique:

```bash
cp .env.local .env
```

Reinicie o `pnpm dev`.

## 6. Conectar

1. Logue como admin em `http://localhost:3000`.
2. Vá em **Configurações → Gmail**.
3. Clique em **Conectar Gmail**.
4. Autorize a conta Google (lembre-se: tem que estar na lista de "Test users" se o consent screen ainda estiver em modo Testing).
5. Após o callback, a conta aparece como "Ativo" em **Contas conectadas**.

## 7. Validar ingestão

Mande um email para a conta conectada (`suporte@suaempresa.com` ou o que conectou). Em até 1–2 min depois do próximo tick do cron:

```bash
# Em outro terminal
pnpm dev:cron
```

você deve ver:
- Aparecer um ticket novo em `/tickets`
- Logs `gmail.ingest done` no terminal do dev server
- `lastSyncedAt` da conexão atualizado

## 8. Validar envio

Abra um ticket criado por email, responda com **Resposta pública**. O job `email.send` é enfileirado; o próximo tick processa e marca a mensagem como `sent`. Quem mandou o email original recebe a resposta na mesma thread Gmail.

---

## Solução de problemas

| Sintoma                                       | Causa provável / fix                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Callback retorna `invalid_state`               | Sessão expirou (TTL de state é 10min). Tente conectar de novo.                                    |
| `Sem refresh_token na resposta`                | Conta já consentiu antes; precisa revogar e reconectar (consent screen → Test users → remove + add). |
| Conexão fica `reauth_required`                 | Refresh token foi revogado ou expirou. Desconecte e reconecte.                                    |
| Polling não encontra emails                    | `historyId` pode estar travado. Apague em `gmail_connections.history_id` e tente de novo.         |
| `Auth failed` 401 em chamadas Google           | Verifique se o Client Secret está correto e se o redirect URI bate exatamente.                    |

---

## Em prod

- Saia de "Testing" do consent screen quando o app for público (verifica revisão da Google se usar scopes restritos).
- Use um secret manager (Vercel Env, Doppler, AWS Secrets Manager) para `GOOGLE_CLIENT_SECRET` e `ENCRYPTION_KEY_BASE64`.
- O cron de polling precisa rodar com a frequência desejada: 1–2min é o sweet spot. Vercel Cron suporta isso no plano pago; em VPS use cron do host.
