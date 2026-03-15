# Configurar Chaves VAPID no Supabase

## Passo a Passo

### 1. Acesse o Supabase Dashboard
- Vá em https://supabase.com
- Faça login e selecione seu projeto

### 2. Vá em Edge Functions > Secrets
- No menu lateral, clique em **Settings** (Configurações)
- Clique em **Edge Functions**
- Clique na aba **Secrets**

### 3. Adicione as Chaves

**Secret 1 - Chave Pública:**
- Clique em **Add new secret**
- **Name**: `VITE_VAPID_PUBLIC_KEY`
- **Value**: `BKql2QWqicmSsBRuQHzFdzgnHJ7oFV6qXt1HXJ7R2YCoMTaTA47S_BfffbO0l2JjFqf7-Ts5xx7H3kzUMmOGO38`
- Clique em **Save**

**Secret 2 - Chave Privada (MANTENHA SECRETA!):**
- Clique em **Add new secret**
- **Name**: `VAPID_PRIVATE_KEY`
- **Value**: `s_FcEDoqg5WWKKqlSfXmWpK8RC-CDDzmkZa2iKFBGuA`
- Clique em **Save**

## Pronto! ✅

Depois de adicionar os secrets, as push notifications funcionarão quando a Edge Function `send-push-notification` for chamada.
