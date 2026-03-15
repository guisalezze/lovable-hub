# ✅ Checklist - Push Notifications

## ✅ Configurado

- [x] Chaves VAPID geradas
- [x] Chave pública no `.env` local
- [x] Chave pública no Vercel (Environment Variables)
- [x] Chaves pública e privada no Supabase (Edge Functions Secrets)

## ⚠️ Ainda Precisa Fazer

### 1. Executar Migration no Supabase

A tabela `push_subscriptions` precisa ser criada:

1. Acesse o Supabase Dashboard
2. Vá em **SQL Editor**
3. Execute o conteúdo do arquivo:
   ```
   supabase/migrations/20260317000001_create_push_subscriptions.sql
   ```

Ou copie e cole este SQL:

```sql
-- Tabela para armazenar subscriptions de push notifications
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Índice para busca rápida por user_id
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- RLS: usuários só podem ver/editar suas próprias subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_select_own" ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_insert_own" ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_update_own" ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_delete_own" ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

### 2. Deploy da Edge Function

A Edge Function `send-push-notification` precisa ser deployada:

**Opção A - Via Supabase CLI (recomendado):**
```bash
supabase functions deploy send-push-notification
```

**Opção B - Via Supabase Dashboard:**
1. Acesse o Supabase Dashboard
2. Vá em **Edge Functions**
3. Clique em **Deploy function**
4. Selecione a pasta `supabase/functions/send-push-notification`
5. Clique em **Deploy**

### 3. Adicionar no config.toml (opcional)

Se quiser que a função não exija JWT, adicione no `supabase/config.toml`:

```toml
[functions.send-push-notification]
verify_jwt = false
```

## 🧪 Testar

Depois de fazer tudo acima:

1. Faça um novo deploy no Vercel (para pegar a variável de ambiente)
2. Acesse o app
3. Vá em **Configurações** > **Notificações Push**
4. Clique em **Ativar Notificações Push**
5. Permita as notificações no navegador
6. Crie uma venda de teste e aprove
7. Você deve receber:
   - Toast visual (se app aberto)
   - Som
   - Notificação push nativa (mesmo com app fechado)

## 🐛 Troubleshooting

- **"Push notifications não estão configuradas"**: Verifique se `VITE_VAPID_PUBLIC_KEY` está no `.env` e no Vercel
- **"Subscription não encontrada"**: Execute a migration no Supabase
- **Push não chega**: Verifique se a Edge Function foi deployada e se as chaves estão corretas no Supabase
