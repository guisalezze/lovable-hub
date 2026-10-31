# Instagram: v1 (modelo fixo) → fluxos visuais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o módulo de automação do Instagram que já existe no CRM (commit `98b8081`, automações de modelo fixo: boas-vindas → botão → link → lembrete) para o modelo da spec: **1 regra = 1 gatilho + 1 fluxo visual** de blocos (Mensagem, Esperar, Tag, Condição, Webhook), contatos com tags, cooldown, anti-duplicado e worker que retoma esperas.

**Spec:** `docs/superpowers/specs/2026-10-31-instagram-fluxos-visuais-design.md` (comportamento, regras da Meta, formato do JSON do fluxo, telas). Ler inteira antes de começar.

**Architecture:** Mantém a base da v1 — login do Instagram (`graph.instagram.com`), `ig_config` com token renovado por `instagram-token-refresh`, `instagram-oauth` para conectar a conta, `instagram-webhook` com validação HMAC já pronta. O que muda: a regra passa a guardar um grafo `flow jsonb`; o webhook passa a achar a regra, gravar o log com `ref` único e executar o motor `run()` da spec; esperas viram jobs em `ig_flow_runs` que o `instagram-worker` retoma. No front, o construtor reusa `@xyflow/react` (já instalado, padrão em `src/components/whatsapp/FunilCanvas.tsx`) em vez do canvas em JS puro descrito na spec — o formato JSON salvo continua o da spec (`x`/`y` dos nós = posição no React Flow).

**Tech Stack:** Supabase Postgres + Deno Edge Functions, React 18 + TanStack Query + shadcn/ui + `@xyflow/react` v12.

## Contexto (estado em 2026-10-31)

- **Arquivos da v1:** `supabase/functions/instagram-{oauth,webhook,worker,token-refresh}/index.ts`, `supabase/migrations/20260719000001_instagram_automation.sql` (tabelas `ig_config`, `ig_automations`, `ig_contacts`, `ig_queue`, `ig_events`), `src/pages/InstagramAutomacoes.tsx` (545 linhas), rota em `App.tsx`, item "Instagram" na seção Connect do `AppSidebar.tsx`.
- **Secrets que o código lê:** `IG_APP_ID`, `IG_APP_SECRET`, `IG_WEBHOOK_VERIFY_TOKEN` (+ `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- **App da Meta:** o app `1435271025361810` é de Ads/Facebook Login e **não serve** (não tem "Instagram login"). Precisa de um app novo com caso de uso "Gerenciar mensagens e conteúdo no Instagram" (ver Tarefa 0).
- **Conta alvo:** @guisalezze (IG user id via Facebook Login: `17841400066365228`; o id via Instagram Login pode ser outro — usar o que o `instagram-oauth` gravar em `ig_config`).
- **Multi-projeto:** a seção Connect (inclui Instagram) é compartilhada entre projetos (ver `2026-08-31-multi-project-isolation-design.md`). **Sem `project_id`** nas tabelas `ig_*` nesta fase.
- **Não verificado ainda:** não achei agendamento (pg_cron) do `instagram-worker` nem do `instagram-token-refresh` nas migrations — confirmar no banco (`select * from cron.job`) na Tarefa 1.

## Global Constraints

- Sem framework de testes no repo — verificação de cada tarefa é manual (SQL, curl, `npm run build` / `tsc --noEmit`, teste real com conta tester).
- Edge functions auto-contidas (sem `_shared/`), `verify_jwt = false` no `config.toml`, como as da v1.
- Migrations via `npx supabase db push --linked --yes` em `lovable-hub-1/` (projeto `lqrlvefeznfaauwgvubl`). `functions deploy`/`secrets set` **sem** `--linked`.
- Validar assinatura do webhook sobre o **corpo cru** (a v1 já faz — não quebrar).
- Responder 200 rápido no webhook; trabalho pesado não pode estourar o timeout da Meta.
- Limites da Meta (spec §4): janela de 24 h, 1 mensagem privada por comentário até a pessoa interagir, sem imagem na 1ª mensagem de comentário, texto 640 / botão 20 / máx. 3 botões.
- **Não apagar** dados nem tabelas da v1 sem migração das automações existentes (Tarefa 2).

---

### Tarefa 0: Configuração na Meta (manual, Guilherme)

- [ ] Criar app novo na Meta com caso de uso **"Gerenciar mensagens e conteúdo no Instagram"**.
- [ ] Em "API setup with Instagram login": adicionar @guisalezze como **Instagram Tester** e aceitar o convite em instagram.com → Configurações → Apps e sites.
- [ ] Redirect URL (Business login): `https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/instagram-oauth`
- [ ] Secrets no Supabase `lqrlvefeznfaauwgvubl`: `IG_APP_ID` e `IG_APP_SECRET` (o **Instagram** App ID/Secret dessa tela, não o do app Meta), `IG_WEBHOOK_VERIFY_TOKEN` (frase aleatória).
- [ ] Webhook: callback `https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/instagram-webhook`, verify token = o secret acima, campos `messages`, `comments`, `messaging_postbacks`.
- [ ] No CRM, clicar em "Conectar Instagram" → conferir linha em `ig_config`.
- [ ] Higiene: redefinir o App Secret do app `1435271025361810` (vazou em conversa) e apagar `C:\Users\R2\Desktop\IG_ACCESS_TOKEN.txt`.

**Verificação:** comentar num post da conta com outra conta tester → linha nova em `ig_events`.

### Tarefa 1: Auditoria da v1 (antes de mexer)

- [ ] Ler os 4 `index.ts`, a migration e `InstagramAutomacoes.tsx` inteiros.
- [ ] Confirmar se `subscribed_apps` no `instagram-oauth` inclui `messaging_postbacks` (hoje pede só `comments,messages` — postback é obrigatório para os botões "continua o fluxo").
- [ ] Conferir `cron.job` para worker e token-refresh; anotar o que falta.
- [ ] Contar automações existentes: `select count(*), bool_or(active) from ig_automations;` — define se a Tarefa 2 precisa converter dados reais.

### Tarefa 2: Banco — novo modelo

Migration nova `supabase/migrations/2026103100000X_instagram_flows.sql`:

- [ ] `ig_automations`: adicionar `flow jsonb`, `trigger text` (`comment|dm|story|mention`), `position int default 0`, `media_label text`. Manter colunas antigas por enquanto (compatibilidade) — ou criar `ig_rules` conforme spec §5 e migrar; **decidir na Tarefa 1** com base no volume de dados. Preferência: reaproveitar `ig_automations` (evita mexer no front/rotas duas vezes).
- [ ] Converter cada automação v1 em fluxo equivalente: start → message(welcome_dm + botão "continua" com `quick_reply_label`) → message(link_text + botão URL) → delay(`reminder_delay_minutes`) → message(reminder_text). `public_replies text[]` → texto com uma linha por item.
- [ ] `ig_contacts`: adicionar `name text`, `tags text[] default '{}'` (+ índice GIN), `last_in_at timestamptz`, `profile_pic text`, `profile_fetched_at timestamptz` (cache 6 h).
- [ ] `ig_replies` (log, spec §5) com `ref text unique`.
- [ ] `ig_flow_runs` (esperas, spec §5) — ou reaproveitar `ig_queue` com `node_id`; preferir tabela nova e deixar `ig_queue` só para envios legados até ser removida.
- [ ] pg_cron: worker a cada 30 s se a versão do pg_cron aceitar `'30 seconds'`, senão 1 min; token-refresh 1×/dia (se a Tarefa 1 mostrou que faltam).
- [ ] RLS: leitura/escrita só para usuários autenticados do CRM, seguindo o padrão das outras tabelas da seção Connect.
- [ ] Regenerar `src/integrations/supabase/types.ts`.

**Verificação:** `db push` ok; `select id, flow from ig_automations` mostra fluxos convertidos.

### Tarefa 3: Motor do fluxo no `instagram-webhook`

- [ ] Manter validação HMAC e log bruto em `ig_events`.
- [ ] Normalizar eventos em itens `{kind, ref, from, username, text, media, payload}` (spec §6, `itemsOf`/`msgKind`), ignorando `is_echo` e mensagens da própria conta.
- [ ] Upsert do contato (`last_in_at` só quando não for comentário); buscar perfil (`username,name,profile_pic`) com cache de 6 h.
- [ ] `autoReply` (spec §7): primeira regra ativa por `position, created_at`; story cai para regras de DM; cooldown (1 h comentário / 12 h demais) gravando `skipped`; claim via insert em `ig_replies` com `ref` único.
- [ ] Resposta pública: sorteia uma linha, troca `{usuario}`.
- [ ] `run()` (spec §8): message / delay / tag / condition / webhook, `MAX_STEPS = 40`, 1ª mensagem de comentário via `recipient.comment_id`, para no botão de fluxo, delay grava `ig_flow_runs`.
- [ ] Postback `f:<regra>:<bloco>:<botão>` com anti-duplicado `pb:<mid>`.
- [ ] Bloco Webhook: POST JSON (spec §8), timeout 10 s.
- [ ] Remover o caminho v1 (`ig_queue` + `message_type`) quando o v2 estiver validado.

**Verificação:** com conta tester — comentar palavra-chave → resposta pública + DM com botão → clicar → resto do fluxo; repetir comentário → `skipped`; reenvio do mesmo evento (curl com payload salvo de `ig_events` + assinatura) → não responde duas vezes.

### Tarefa 4: `instagram-worker` retoma esperas

- [ ] A cada execução: até 20 jobs `waiting` com `resume_at <= now()`, claim atômico (`update ... where status='waiting'`), `run(rule, node_id)`, marca `done`/`failed`; regra pausada/apagada → `failed`.
- [ ] O motor `run()` fica duplicado entre webhook e worker (sem `_shared/`) — manter as duas cópias idênticas, com comentário apontando uma para a outra. Alternativa: o worker chama o webhook via rota interna autenticada; decidir na implementação.

**Verificação:** fluxo com espera de 1 min → mensagem chega após ~1–2 min; `ig_flow_runs.status = 'done'`.

### Tarefa 5: API do painel

- [ ] Ações de admin (spec §9) — CRUD de regras, posts recentes (`GET /me/media`), contatos com busca/filtro por tag, editar tags, teste do bloco webhook. Avaliar se o front pode falar direto com as tabelas via supabase-js + RLS (padrão das outras telas do CRM) e deixar edge function só para o que precisa do token (posts recentes, teste de webhook).
- [ ] Validação ao salvar (spec §9): nome ≤ 80, menção zera keywords, post/resposta pública só em comentário, gatilho ligado a algum bloco ou com resposta pública, ≤ 80 blocos, JSON ≤ 200 KB.

### Tarefa 6: Tela "Instagram" (lista)

Reescrever `src/pages/InstagramAutomacoes.tsx` (spec §10.1):
- [ ] Status da conta (conectada, @, seguidores, validade do token, botão reconectar).
- [ ] Tabela de fluxos (nome/pausado, quando, palavras-chave, nº de blocos, editar/pausar/excluir com 2º clique) + "Novo fluxo".
- [ ] Contatos (busca por @, filtro por tag com contagem, modal de tags).
- [ ] Últimas respostas (status Respondido/Falhou/Ignorado/Enviando + erro).
- [ ] Seguir identidade visual atual do CRM (ver `2026-03-30-visual-identity-design.md`).

### Tarefa 7: Construtor visual

Nova rota `/instagram-automacoes/:id` com `@xyflow/react`, usando `FunilCanvas.tsx` como referência de padrão:
- [ ] Node types customizados: start, message, delay, tag, condition, webhook (cores/ícones da spec §3); handles de saída por `outs(n)` (next / yes / no / b0..b2).
- [ ] Conversão `flow.nodes` ⇄ nodes/edges do React Flow (edges derivadas de `next`/`yes`/`no`/`buttons[i].next`).
- [ ] Soltar ligação no vazio → menu "Novo bloco" já ligado (`onConnectEnd`).
- [ ] Botões "+ Mensagem / Esperar / Tag / Condição / Webhook" e "Organizar" (layout por BFS, 360 px × 260 px).
- [ ] Painel lateral do bloco selecionado (spec §10.2), gaveta no mobile.
- [ ] Avisos ao vivo (borda laranja): gatilho solto, bloco inalcançável, mensagem vazia, link sem http, espera > 23 h, tag vazia, webhook sem URL.
- [ ] Topbar: nome inline, "● não salvo", Ativo, Salvar (`Ctrl/Cmd+S`), aviso ao sair com mudança.

**Verificação:** `npm run build`; criar o fluxo de exemplo da spec §3 pela UI, salvar, recarregar e conferir o JSON salvo.

### Tarefa 8: Teste ponta a ponta e publicação

- [ ] Roteiro completo com 2 contas tester (comentário, DM, resposta a story, menção, botão, espera, tag, condição, webhook para um endpoint de teste).
- [ ] Revisão do app na Meta (modo Live) para atender quem não é tester: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments` — gravar vídeos de uso de cada permissão.

## Fora do escopo

- Várias contas de Instagram / isolamento por projeto.
- Broadcast/mensagens em massa, inbox de conversa manual, analytics de fluxo.
