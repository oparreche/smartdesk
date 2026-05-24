# 09 — Configurando WhatsApp (Meta Cloud API)

Guia passo a passo para conectar um número WhatsApp Business ao SmartDesk usando a
**Cloud API oficial** do Meta. Antes de começar você precisa de:

- Conta Meta for Developers (developers.facebook.com).
- WhatsApp Business Account (WABA) — pode criar pela App.
- Um número de telefone dedicado ao WhatsApp Business (NÃO use número pessoal já cadastrado em outro WhatsApp).
- Em produção: domínio HTTPS público apontando para o SmartDesk (webhook é exposto).

---

## 1. Criar/abrir a App no Meta for Developers

1. Vá em <https://developers.facebook.com/apps>.
2. **Create App** → tipo **Business**.
3. Adicione o produto **WhatsApp**.

## 2. Obter `phone_number_id` e `business_account_id`

1. Menu lateral → **WhatsApp → API Setup**.
2. Selecione (ou crie) seu WhatsApp Business Account.
3. Adicione um número de telefone (verificação por SMS/voz).
4. Anote:
   - **Phone number ID** (15+ dígitos, ex.: `123456789012345`).
   - **WhatsApp Business Account ID** (também 15+ dígitos).

## 3. Gerar um Access Token de longa duração

Tokens "temporários" expiram em 24h. Você precisa de um permanente.

### Opção rápida — System User token (recomendada)

1. **Business Settings** (business.facebook.com) → **Users → System Users**.
2. Crie um system user com role **Admin**.
3. **Add Assets** → WhatsApp Account → marque sua WABA → permissão **Manage**.
4. **Generate New Token** → escolha a App → escopos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Token é mostrado **uma vez** — copie agora.

### Opção alternativa — usar token temporário pra testes

API Setup → "Temporary access token" → copia. Lembrar que expira em 24h e vai pedir reconexão.

## 4. (Opcional mas recomendado) App Secret

Para o SmartDesk validar a assinatura HMAC `X-Hub-Signature-256` que o Meta envia:

1. **App settings → Basic**.
2. Em **App Secret**, clique **Show**, copie.

Sem App Secret, o webhook ainda funciona — mas qualquer um que descubra o ID da
sua conexão pode enviar payloads falsos.

## 5. Cadastrar a conexão no SmartDesk

1. Logue como admin/owner.
2. **Configurações → WhatsApp → Conectar número**.
3. Preencha:
   - **Telefone (display)**: `+55 11 98888-7777` (apenas estético).
   - **Phone Number ID**: copiado em [2].
   - **Business Account ID**: copiado em [2].
   - **Access Token**: copiado em [3].
   - **App Secret**: copiado em [4] (opcional).
4. **Conectar**. O SmartDesk gera um **verify token** único e mostra duas strings:
   - **Callback URL**: `https://seudominio.com/api/webhooks/whatsapp/<connection-id>`
   - **Verify token**: random string base64url

## 6. Configurar o webhook no Meta

1. Volte em **WhatsApp → Configuration → Webhooks**.
2. **Edit**:
   - **Callback URL**: cole a URL do SmartDesk.
   - **Verify token**: cole o token gerado.
3. Clique **Verify and save**. O Meta faz um GET no SmartDesk com `hub.challenge` —
   o SmartDesk valida o verify token e responde com o challenge.
4. Subscribe nos fields:
   - `messages` (obrigatório — mensagens inbound).
   - `message_status_updates` (atualiza deliveryStatus das mensagens enviadas).

## 7. Validar o fluxo

1. Mande uma mensagem WhatsApp do seu celular pessoal para o número conectado.
2. Em até 5s, o SmartDesk:
   - Cria um requester pelo telefone.
   - Cria um ticket novo `origin=whatsapp`.
   - Aparece em `/tickets` com badge "WhatsApp recebido".
3. Abra o ticket — composer detecta canal `whatsapp` automaticamente.
4. Responda — vai para o cliente via Cloud API.
5. Volte e veja `deliveryStatus: sent` (e `delivered`/`read` se o cliente abrir).

---

## Limitações do MVP

| Limitação | Workaround | Quando entregar |
|---|---|---|
| Apenas texto simples (sem templates HSM) | Use templates aprovados via Graph API direto | Fase 10 |
| Mensagens fora da janela de 24h falham | Use template (HSM) | Fase 10 |
| Mídia inbound só captura metadata + descrição | Download de mídia pra S3 + exibição | Fase 10 |
| Sem read receipts visíveis | Status `delivered`/`read` é só interno | Fase 10 |
| Sem botões interactive nem listas | Reply via texto puro | Fase 11+ |
| Sem suporte multi-agent (typing indicator) | — | Fase 11+ |

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| Webhook retorna 404 ao "Verify and save" | Connection-id errado na URL | Refaça a conexão e copie URL completa |
| Webhook retorna 403 | Verify token errado OU app secret não bate | Copie o verify token exato; remova/refaça app secret |
| Mensagens não chegam | Webhook não está subscrito em `messages` | Em Configuration → Webhooks → marque field |
| Mensagem outbound falha "re-engagement" | Passou janela de 24h | Use template aprovado (HSM) — não suportado no MVP |
| Mensagem outbound falha "phone number not in allowed list" | Você está em **Development Mode** no Meta | Adicione o número de destino em Webhook → "Test phone numbers" OU saia do dev mode |
| `lastError: invalid_grant` na conexão | Token expirou ou foi revogado | Gere novo token e use **Update token** em /settings/whatsapp |

---

## Segurança

- Access token e App Secret são cifrados em repouso com `AES-256-GCM` (mesma chave usada para tokens Gmail).
- O endpoint público `/api/webhooks/whatsapp/[id]` valida HMAC quando App Secret está configurado.
- Tokens nunca aparecem na UI após salvar — só os últimos 4 caracteres.
- Logs do servidor têm redaction de `authorization`, `token`, `access_token` (pino).

## Em produção

- A Cloud API exige HTTPS público — não funciona em `localhost`.
- Para desenvolvimento local, use **ngrok** ou **cloudflared** para tunelar:
  ```bash
  ngrok http 3000
  # use a URL https gerada como APP_URL e na Callback URL
  ```
- O endpoint do webhook não precisa de autenticação adicional (a validação HMAC do Meta basta).
