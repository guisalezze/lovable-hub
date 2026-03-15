# Configuração de Push Notifications no PWA

## Variáveis de Ambiente Necessárias

Para que as notificações push funcionem, você precisa gerar chaves VAPID e configurá-las:

### 1. Gerar Chaves VAPID

Use o comando npm para gerar as chaves:

```bash
npx web-push generate-vapid-keys
```

Isso gerará algo como:
```
Public Key: BEl62iUYgUivxIkv69yViEuiBIa40HI...
Private Key: 8KYkd... (mantenha secreto!)
```

### 2. Configurar Variáveis

**No arquivo `.env` local (desenvolvimento):**
```env
VITE_VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa40HI...
```

**No Supabase Dashboard (Edge Functions):**
1. Vá em **Settings** > **Edge Functions** > **Secrets**
2. Adicione:
   - `VITE_VAPID_PUBLIC_KEY` = sua chave pública
   - `VAPID_PRIVATE_KEY` = sua chave privada (mantenha secreta!)

### 3. Executar Migrations

Execute as migrations no Supabase para criar a tabela de subscriptions:

```sql
-- Execute no SQL Editor do Supabase:
-- 1. supabase/migrations/20260317000001_create_push_subscriptions.sql
```

### 4. Deploy da Edge Function

A Edge Function `send-push-notification` precisa ser deployada:

```bash
supabase functions deploy send-push-notification
```

## Como Funciona

1. **Usuário ativa push**: Vai em Configurações > Notificações Push > Ativar
2. **Subscription salva**: O navegador gera uma subscription única e salva no Supabase
3. **Venda aprovada**: Quando uma venda é aprovada (via Realtime), o sistema:
   - Mostra toast visual (se app aberto)
   - Toca som
   - Envia push notification nativa (se usuário tiver ativado)
4. **Push recebida**: Mesmo com app fechado, o usuário recebe notificação no sistema

## Testando

1. Ative as notificações push em Configurações
2. Crie uma venda de teste e aprove
3. Você deve receber:
   - Toast visual (se app aberto)
   - Som
   - Notificação push nativa (mesmo com app fechado)

## Troubleshooting

- **"Seu navegador não suporta notificações push"**: Use Chrome, Edge ou Safari (iOS 16.4+)
- **"Permissão negada"**: Vá nas configurações do navegador e permita notificações para o site
- **Push não chega**: Verifique se as chaves VAPID estão configuradas corretamente no Supabase
