
# Plano: Integracao Google Calendar/Meet + Pagina de Integracoes Melhorada

## Resumo

Salvar os secrets do Google OAuth, criar a infraestrutura de banco + edge functions para autenticacao e sincronizacao com Google Calendar/Meet, redesenhar a pagina de integracoes, e conectar a Agenda para criar eventos automaticamente.

---

## 1. Salvar Secrets

Adicionar dois secrets no projeto:
- `GOOGLE_CLIENT_ID`: `47011130046-jo3obfeo401duoqfpki4b04btbp4reag.apps.googleusercontent.com`
- `GOOGLE_CLIENT_SECRET`: `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`

---

## 2. Migracao: Tabela `google_tokens`

```sql
CREATE TABLE public.google_tokens (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own tokens"
  ON public.google_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens"
  ON public.google_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens"
  ON public.google_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens"
  ON public.google_tokens FOR DELETE
  USING (auth.uid() = user_id);
```

---

## 3. Edge Functions

### `google-auth-start`
- Recebe o JWT do usuario para identificar quem esta conectando
- Gera a URL de autorizacao OAuth do Google com escopos de Calendar
- Inclui `state` com o user_id para rastrear no callback
- Retorna a URL para o frontend redirecionar

### `google-auth-callback`
- Recebe o `code` e `state` do Google
- Troca o code por access_token + refresh_token
- Salva na tabela `google_tokens` usando service role
- Redireciona o navegador para `/integracoes?google=connected`

### `google-calendar-event`
- Recebe: titulo, data/hora inicio, data/hora fim (opcional), tipo (call ou tarefa)
- Busca os tokens do usuario na tabela
- Se token expirado, faz refresh automatico
- Cria evento no Google Calendar via API
- Para calls: inclui `conferenceDataVersion=1` para gerar link do Google Meet
- Retorna o `eventId` e `meetLink` (se call)

### Configuracao em `supabase/config.toml`
Adicionar as 3 novas functions com `verify_jwt = false`.

---

## 4. Pagina de Integracoes Redesenhada

Substituir o conteudo estatico atual por cards interativos:

**Perfect Pay** - Mostra endpoint do webhook com botao de copiar (mantem como esta, apenas melhora UI)

**Google Calendar + Meet** - Botao "Conectar com Google" que chama `google-auth-start`. Apos conectado, mostra status verde "Conectado" com opcao de desconectar. Verifica status consultando a tabela `google_tokens`.

**Meta Ads** - Campos para Access Token e Account ID. Botao salvar que atualiza os secrets via interface (informativo por enquanto, pois os secrets ja estao configurados).

---

## 5. Integracao na Agenda

### Ao criar uma Call:
1. Salva no banco (como ja faz)
2. Verifica se o usuario tem Google conectado (consulta `google_tokens`)
3. Se sim, chama `google-calendar-event` com tipo "call"
4. Recebe de volta o `meet_link` e `google_event_id`
5. Atualiza a call no banco com esses dados
6. Remove o campo manual de "Link do Meet" (sera gerado automaticamente)

### Ao criar uma Tarefa com data:
1. Salva no banco (como ja faz)
2. Verifica se o usuario tem Google conectado
3. Se sim, chama `google-calendar-event` com tipo "tarefa" (evento de dia inteiro, sem Meet)

---

## 6. Hook `useGoogleAuth`

Novo hook que:
- Consulta `google_tokens` para verificar se o usuario esta conectado
- Expoe `isConnected`, `connect()` (redireciona para OAuth), `disconnect()` (deleta token)
- Usado tanto na pagina de Integracoes quanto na Agenda

---

## Arquivos a criar/modificar

| Arquivo | Acao |
|---|---|
| Migracao SQL | Criar tabela `google_tokens` |
| `supabase/functions/google-auth-start/index.ts` | Criar |
| `supabase/functions/google-auth-callback/index.ts` | Criar |
| `supabase/functions/google-calendar-event/index.ts` | Criar |
| `supabase/config.toml` | Adicionar 3 functions |
| `src/hooks/useGoogleAuth.ts` | Criar |
| `src/pages/Integracoes.tsx` | Redesign completo |
| `src/pages/Agenda.tsx` | Integrar com Google Calendar apos criar call/tarefa |
