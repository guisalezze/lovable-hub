

## Plano: Sistema de Notificacoes de Tarefas via WhatsApp Cloud API

### Resumo
Implementar envio de mensagens WhatsApp via Cloud API para notificacoes de atribuicao de tarefas e lembretes escalonados com frequencia crescente conforme a data de vencimento se aproxima.

---

### 1. Migracoes de Banco de Dados

**Tabela `task_whatsapp_notifications`:**
- Campos: id, task_id (FK tasks), recipient_user_id, recipient_phone, message_type (assignment/reminder), whatsapp_message_id, status (pending/sent/failed/delivered/read), error_message, created_at, sent_at
- Indices em task_id, recipient_user_id, created_at
- RLS: admins ALL, users SELECT own

**Nota:** A tabela `profiles` ja tem `phone_e164` -- vamos usar esse campo existente. Nao e necessario criar novo campo.

**Drop do trigger existente `on_task_assigned`** que ja insere em notifications/pending_webhooks -- sera substituido pela logica de WhatsApp via chamada direta do frontend (evitando dependencia de `pg_net` e complexidade de triggers HTTP).

---

### 2. Edge Functions (3 funcoes)

#### `whatsapp-send-message` -- Envio generico
- Recebe: `to`, `template_name`, `template_language`, `template_params`
- Busca config de `app_settings` key `whatsapp_cloud_config` (phone_number_id, access_token)
- Chama `https://graph.facebook.com/v21.0/{phone_number_id}/messages`
- Retorna `whatsapp_message_id` ou erro
- Usa Service Role Key (nao expoe token ao frontend)
- CORS headers + verify_jwt = false (validacao interna via service role ou JWT)

#### `task-notify-assignment` -- Notificacao imediata
- Recebe: `task_id`, `assigned_to`
- Busca tarefa, perfil do assignee (phone_e164), perfil do criador
- Regras: skip se created_by === assigned_to, skip se sem telefone (registra falha)
- Chama `whatsapp-send-message` internamente (fetch local)
- Registra em `task_whatsapp_notifications` + `notifications` (in-app fallback)
- Template params: [nome_criador, titulo, data, hora, prioridade]

#### `task-reminders-cron` -- Reescrita do `run-reminders`
- Roda via pg_cron a cada hora
- Horario de silencio: 22h-07h (UTC-3)
- Busca tarefas nao concluidas com assigned_to e due_date
- Escalonamento de frequencia:
  - `> 7 dias`: 3/dia
  - `4-7 dias`: 4/dia
  - `2-3 dias`: 6/dia
  - `1 dia`: 8/dia
  - `hoje`: 10/dia
  - `atrasada`: 12/dia
  - `urgente`: +2 extras
- Verifica contagem de hoje em `task_whatsapp_notifications` e intervalo desde a ultima
- Registra envio + cria notificacao in-app como fallback

---

### 3. Alteracoes no Frontend

#### `src/hooks/useTasks.ts` -- Chamar notificacao no assignment
- No `useCreateTask` e `useUpdateTask`, apos sucesso, se `assigned_to` esta preenchido e diferente do usuario logado, chamar edge function `task-notify-assignment` via `supabase.functions.invoke()`

#### `src/pages/Configuracoes.tsx` -- Adicionar secao WhatsApp
- Novo componente `WhatsAppConfig` mostrado abaixo de `TeamManagement` (so para admins)
- Card com icone MessageSquare, campos:
  - Phone Number ID (texto)
  - Access Token (password com toggle)
  - Botao "Salvar" -> upsert em `app_settings` key `whatsapp_cloud_config`
  - Botao "Testar Conexao" -> chama `whatsapp-send-message` com template teste
  - Badge de status (Conectado/Nao configurado)

#### `src/components/settings/TeamManagement.tsx` -- Campo telefone
- Adicionar coluna "Telefone" na tabela de membros
- Adicionar campo telefone no formulario de adicionar membro
- Validacao: minimo 12 digitos, apenas numeros
- Salvar no campo `phone_e164` do profile

---

### 4. Configuracao do pg_cron
- SQL insert (nao migracao) para agendar `task-reminders-cron` a cada hora
- Requer extensoes `pg_cron` e `pg_net` habilitadas

---

### 5. Config.toml
Adicionar as 2 novas functions:
```
[functions.whatsapp-send-message]
verify_jwt = false

[functions.task-notify-assignment]
verify_jwt = false

[functions.task-reminders-cron]
verify_jwt = false
```

---

### Ordem de Implementacao
1. Migracao: criar tabela `task_whatsapp_notifications`
2. Edge Function `whatsapp-send-message`
3. Edge Function `task-notify-assignment`
4. Edge Function `task-reminders-cron` (reescrita do run-reminders)
5. Config.toml atualizado
6. Frontend: componente WhatsAppConfig na pagina de Configuracoes
7. Frontend: campo telefone no TeamManagement
8. Frontend: trigger de notificacao no hook useTasks
9. SQL insert para pg_cron job

---

### Templates WhatsApp (documentacao para o usuario)
O usuario precisara criar manualmente no Meta Business Suite:
1. **`task_assignment`**: `{{1}} atribuiu uma tarefa para você: "{{2}}". Prazo: {{3}} às {{4}}. Prioridade: {{5}}. Acesse o CRM para mais detalhes.`
2. **`task_reminder`**: `{{1}} — Tarefa: "{{2}}". Prazo: {{3}}. Status atual: {{4}}. Acesse o CRM e marque como concluída.`

