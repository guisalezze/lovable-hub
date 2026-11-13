# Instagram: campanhas no modelo OpenReply, conectadas pelo Zernio

Substitui o módulo de fluxos visuais (`2026-10-31-instagram-fluxos-visuais-design.md` e `2026-11-11-instagram-openreply-features-design.md` deixam de valer). Pedido do usuário: "troca o sistema inteiro pelo OpenReply e conecta com o Zernio", escolhendo reescrever dentro do CRM.

Motivo: o app próprio da Meta não recebe eventos de quem não tem papel no app (falta acesso avançado/App Review). O Zernio é um app da Meta já aprovado; a conta do Instagram é conectada lá e o CRM fala só com a API do Zernio.

Referência técnica obrigatória: `docs/superpowers/research/openreply-zernio-brief.md` (endpoints, payloads, assinatura, regras do OpenReply). Onde esta spec e o brief divergirem, vale esta spec.

## 0. Princípios

- Uma conta de Instagram, uma conexão Zernio (CRM de um usuário só). Sem workspaces, papéis, i18n, API/MCP, importação CSV.
- Chave do Zernio só como segredo do Supabase `ZERNIO_API_KEY` (nunca em código, banco, log ou resposta). O usuário roda `npx supabase secrets set ZERNIO_API_KEY=...`.
- Nada de chamar a Meta direto. Toda chamada externa vai para `https://zernio.com/api/v1` com `Authorization: Bearer <ZERNIO_API_KEY>`, timeout 30 s.
- Envio na dúvida não se repete (regra do OpenReply): 5xx, erro de rede ou 2xx sem `messageId` = "entrega não confirmada", não tenta de novo. Só 4xx confirmados (e 429) podem ser repetidos.
- Texto da interface em português.
- Código compartilhado entre edge functions em `supabase/functions/_shared/` (o CLI empacota `_shared` no deploy).

## 1. Banco (migration `20261113000001_instagram_zernio.sql`)

Tabelas antigas (`ig_automations`, `ig_flow_runs`, `ig_replies`, `ig_links`, `ig_link_clicks`, `ig_follower_snapshots`, `ig_config`, `ig_queue`, `ig_events`) **não são apagadas** (dados preservados), só deixam de ser usadas. `ig_contacts` continua sendo usada.

A migration:
- Desagenda os crons antigos `instagram-worker-every-minute` e `instagram-token-refresh-daily` (padrão `select cron.unschedule(jobid) from cron.job where jobname = ...`).
- Agenda `ig-campaign-worker-every-minute` (`* * * * *`) chamando `.../functions/v1/ig-campaign-worker` com o mesmo padrão `net.http_post` + anon bearer da migration `20261031000001`.

Novas tabelas (RLS ligado em todas):

`ig_zernio` (linha única; **só service_role**, RLS sem policies)
- `id int primary key default 1 check (id = 1)`
- `profile_id text`, `account_id text` (Zernio `_id`), `ig_user_id text` (`platformUserId`), `username text`, `followers_count int`
- `webhook_id text`, `webhook_secret text` (32 bytes hex gerado pelo CRM)
- `last_reconcile_at timestamptz`, `last_worker_at timestamptz`, `updated_at timestamptz default now()`

`ig_campaigns` (policies authenticated select/insert/update/delete, padrão do projeto)
- `id uuid pk default gen_random_uuid()`, `name text not null` (≤100), `active boolean not null default true`
- Post: `post_mode text not null default 'post' check in ('post','any','next_reel')`, `post_id text`, `post_url text`, `post_label text` (legenda ≤80), `next_reel_since timestamptz`
- Palavras: `keywords text[] not null default '{}'` (≤10, cada ≤50), `match_any boolean not null default false`, `whole_word boolean not null default true`
- `dm_trigger boolean not null default false` (também dispara em DM e resposta de story que batem as palavras)
- Resposta pública: `public_reply_enabled boolean default false`, `public_replies text[] default '{}'` (≤10 variações, cada ≤1000)
- DM de abertura (2 passos): `opening_enabled boolean default false`, `opening_message text` (≤640), `opening_button text` (≤20)
- Mensagem final: `dm_message text not null` (≤1000; ≤640 quando vai com botões; aceita `{username}` e `{link}`)
- Links: `link1_label text` (≤20), `link1_url text`, `link2_label text`, `link2_url text` (http/https)
- Seguir: `require_follow boolean default false`, `follow_message text` (≤640), `follow_button text` (≤20, default "Já estou seguindo ✅")
- Follow-up: `followup_enabled boolean default false`, `followup_message text` (≤1000), `followup_delay_min int default 60 check 0..1440`
- Relatório: `share_slug text unique` (null = não compartilhado)
- `created_at`, `updated_at`
- Validação também no banco (check): `post_mode<>'post' or post_id is not null`; `match_any or cardinality(keywords)>0`.

`ig_dm_logs` (authenticated select; escrita só service_role)
- `id uuid pk`, `campaign_id uuid → ig_campaigns on delete cascade`, `trigger_ref text not null` (comment id; `dm:<mid>`; `reveal:<igsid>`), `source text` (`webhook|polling|dm|button|read|followup`)
- `ig_user_id text`, `username text`, `trigger_text text`, `matched_keyword text`
- `status text not null default 'pending' check in ('pending','sent','failed','skipped_dedup','skipped_rate_limit','unconfirmed')`
- `attempts int default 0`, `error text`, `sent_at timestamptz`
- `public_status text` (null|'sent'|'failed'|'unconfirmed'), `public_error text`, `public_sent_at timestamptz`
- `created_at`, `updated_at`; `unique (campaign_id, trigger_ref)`

`ig_jobs` (fila; só service_role)
- `id bigserial pk`, `kind text check in ('comment','message','postback','read','followup','follow_recheck')`, `payload jsonb not null`, `dedupe_key text unique` (null permitido), `run_at timestamptz not null default now()`, `status text default 'queued' check in ('queued','running','done','failed','dead')`, `attempts int default 0`, `last_error text`, `locked_at timestamptz`, `created_at`
- índice `(status, run_at)`
- função `ig_claim_jobs(p_limit int)` security definer: `update ... set status='running', locked_at=now(), attempts=attempts+1 where id in (select id ... where status='queued' and run_at<=now() order by run_at for update skip locked limit p_limit) returning *`. Execute só para service_role.

`ig_webhook_events` (só service_role): `id uuid pk`, `event_id text unique` (header `X-Zernio-Event-Id`), `event text`, `payload jsonb`, `created_at`. Limpeza > 30 dias pelo worker.

`ig_rate` (só service_role): `hour timestamptz pk`, `count int`. Função `ig_take_slot()` security definer: insere/incrementa a hora atual (`date_trunc('hour', now())`) só se `count < 750`; devolve boolean. `ig_release_slot()` decrementa (piso 0).

`ig_tracked_links` (authenticated select): `id uuid pk`, `campaign_id → cascade`, `position int` (1|2), `slug text unique` (10 base62), `url text`, `unique(campaign_id, position)`.
`ig_tracked_link_clicks` (nome novo; `ig_link_clicks` antiga existe) (authenticated select; insert só service_role): `id bigserial`, `link_id → cascade`, `campaign_id uuid`, `recipient text` (hash, nunca o igsid puro), `created_at`.

`ig_follower_history` (authenticated select): `day date pk`, `followers int`, `updated_at`.

`ig_postback_receipts` (só service_role): `id text pk` (sha256 de campanha+pessoa+mid), `created_at` — garante que um toque não entrega duas vezes.

Funções do relatório público (security definer, execute só service_role): `ig_campaign_report(p_slug text)` devolve jsonb `{name, days:[{day, sent, failed, skipped}] (30 dias, fuso America/Sao_Paulo), totals:{sent, failed, skipped}, clicks:[{position, label, host, clicks, unique}]}`; slug inexistente → null.

`src/integrations/supabase/types.ts`: adicionar as tabelas novas à mão (sem remover as antigas).

## 2. Cliente Zernio (`_shared/zernio.ts`)

Funções (todas usam `ZERNIO_API_KEY`; nunca devolvem corpo de erro bruto para o navegador; erro → `ZernioError {status, code, message}` com mensagem em português para 401/402/403/429):
- `listProfiles()`, `listAccounts(profileId)` (só `platform=instagram`, ativas, com `platformUserId`)
- `connectUrl(profileId, redirectUrl)` → valida que `authUrl` é https em `instagram.com|www.instagram.com|facebook.com|www.facebook.com|zernio.com`
- `ensureWebhook(url, secret, existingId?)` → `GET/POST/PUT /webhooks/settings` com `{name:"CRM Instagram", url, secret, events:["comment.received","message.received","message.read"], isActive:true}`
- `listPosts(accountId)` (25 últimos; reel = permalink contém `/reel/`)
- `listComments(mediaId, accountId)` (100 por página, até 3 páginas)
- `privateReply(postId, commentId, accountId, message, buttons?)`, `publicReply(postId, commentId, accountId, message)`, `sendDm(conversationOrIgsid, accountId, message, buttons?, idempotencyKey)`
- `followStatus(accountId, igsid)` → `true|false|null` (`?refresh=true`; erro → null)
- `listConversations(accountId)`, `listMessages(conversationId, accountId)`
- `followerHistory(accountId, days=90)`, `accountInfo(accountId)` (followersCount)
- Botões: `{type:"url",title,url}` | `{type:"postback",title,payload}`; título truncado em 20; corpo truncado em 640 quando há botões.
- Resultado de envio: `{ok:true, messageId}` | `{ok:false, confirmed:boolean, status, message}` (confirmed=false para 5xx/rede/2xx sem id).

DM para quem só comentou: usa `privateReply`. DM para quem já mandou mensagem/tocou botão: `sendDm` com o `conversationId` do webhook quando houver; senão o IGSID (o OpenReply faz assim e funciona).

## 3. Motor (`_shared/engine.ts`), usado por webhook e worker

Normalização de evento Zernio → `Ev`:
- `comment.received` → `{type:'comment', commentId, mediaId: comment.platformPostId, text, from: author.id, username: author.username}`; ignora `author.isOwnAccount` e autor = `ig_user_id`.
- `message.received` com `direction='incoming'`: se `metadata.postbackPayload` → `{type:'postback', payload, mid, from, conversationId}`; senão `{type:'message', mid, text, from, username: sender.username, conversationId, story: !!metadata.storyReply}`. `outgoing` é ignorado.
- `message.read` → `{type:'read', from: conversation.participantId}`.
- Outra conta (`account.id ≠ ig_zernio.account_id`) → ignora.

Casamento de palavras (porta de `keyword-matcher` do OpenReply): normaliza (minúsculas, sem acento latino, sem emoji/símbolos, mantém letras/números), inteira = regex com fronteira Unicode `(?<![\p{L}\p{N}])kw(?![\p{L}\p{N}])` flag `iu`; parcial = `includes`. `match_any` = qualquer texto. Guarda a 1ª palavra que bateu.

Campanha ativa casa comentário quando: `post_mode='any'`, ou `post_mode='post' and post_id = mediaId`. `next_reel` pendente (`post_id` nulo) não responde. Ordem: `created_at` asc.

**Comentário** (job `comment`), para cada campanha que casa:
1. upsert `ig_dm_logs (campaign_id, trigger_ref=commentId)`; se o DM já está `sent|unconfirmed|skipped_*` ou `attempts>=3` e a resposta pública já foi tratada → pula.
2. Resposta pública (se ligada, ainda não tratada): variação aleatória com `{username}` → `publicReply`. Resultado em `public_status/public_error`.
3. Dedupe: outra campanha já tem log `sent` para o mesmo comentário → `skipped_dedup` (Instagram só permite 1 resposta privada por comentário).
4. Limite: `ig_take_slot()` falso → se `payload.requeue < 3` reagenda +30 min (`status pending`, erro "Limite de 750/h; nova tentativa agendada"), senão `skipped_rate_limit`.
5. Escolhe a mensagem:
   - `opening_enabled` → `opening_message` com botão postback `(require_follow?'fc':'rv'):<campaign>:open`.
   - senão `require_follow` e `followStatus` = `false` → `follow_message` com botão postback `fc:<campaign>`.
   - senão → mensagem final (ver "Revelar").
6. `privateReply`. Sucesso → `sent`, `sent_at`. Falha confirmada → `failed` (+ `ig_release_slot()`), repetível pelo job (até 3). Não confirmada → `unconfirmed`, sem repetir.
7. Upsert em `ig_contacts` (`instagram_user_id`, `username`).

**Revelar** (mensagem final): `dm_message` com `{username}` (fallback "você"); se há links → botões `url` (até 2, `link1_label` default "Abrir link") apontando para `<SUPABASE_URL>/functions/v1/ig-r?s=<slug>&r=<hash>` e `{link}` removido do texto; sem links → `{link}` vira vazio. `hash` = primeiros 22 chars base64url de HMAC-SHA256(`webhook_secret`, `recipient:<igsid>`). Depois da revelação com sucesso, se `followup_enabled` → job `followup` com `run_at = now + delay`, `dedupe_key followup:<campaign>:<igsid>`.

**Toque em botão** (job `postback`, payload `rv:<id>[:open]` ou `fc:<id>[:open]`): campanha ativa; recibo `ig_postback_receipts` (id = sha256(campanha|pessoa|mid)) — já existe → para.
- `rv` → revelar (via `sendDm`), log `trigger_ref='reveal:<igsid>'`, `source='button'`.
- `fc` → `followStatus`: `true` ou `null` → revelar (fail-open depois do toque). `false` e tocou no botão de abertura (`:open`) → manda `follow_message` com botão `fc:<id>`. `false` no botão do pedido → agenda `follow_recheck` em 20 s (attempt 1) e 40 s depois (attempt 2), `dedupe_key recheck:<campaign>:<igsid>:<attempt>`; na 1ª manda "Conferindo… 👀". Depois do último `false` → reenvia o pedido. Se a revelação falhar com erro confirmado, apaga o recibo.

**Mensagem/story** (job `message`): para campanhas com `dm_trigger`, casa palavras no texto; dedupe `trigger_ref='dm:<mid>'`; se `require_follow` e `followStatus=false` → pedido de seguir; senão revelar. Usa `sendDm`.

**Leitura** (job `read`): para a pessoa, logs `sent` de campanhas com `opening_enabled` nas últimas 24 h sem revelação (`reveal:<igsid>` inexistente) → job `postback` com `{payload:'rv:<id>', fallback:true}` em 5 min, `dedupe_key read:<campaign>:<igsid>`. No fallback com `require_follow`, só revela se `followStatus === true`; erro de janela fechada é engolido.

**Follow-up** (job `followup`): `sendDm(followup_message)`; erro só registra.

## 4. Edge functions

- `zernio-webhook` (pública, `verify_jwt=false`): lê corpo cru; HMAC-SHA256 hex do corpo com `ig_zernio.webhook_secret`, comparação em tempo constante com `X-Zernio-Signature` (64 hex, sem prefixo) → 401 se falhar. Grava `ig_webhook_events` por `X-Zernio-Event-Id` (conflito → 200 "duplicado"). Normaliza e insere o job (`comment` dedupe `comment:<commentId>`, `message` `message:<mid>`, `postback` `postback:<mid>`, `read` sem dedupe mas no máx. 1 por pessoa por minuto). Responde 200 logo; se falhar ao gravar → 500 (o Zernio reenvia). Evento `test:true` → 200.
- `ig-campaign-worker` (cron 1 min, `verify_jwt=false`): laço de até ~50 s: `ig_claim_jobs(10)`, processa, dorme 5 s, repete (assim as reconferências de 20/40 s funcionam). Job com erro confirmado: `attempts<3` → volta `queued` com `run_at` +5/15/45 min; senão `failed`. Jobs `running` há > 10 min → `queued` de novo (ou `dead` se attempts≥3). Manutenção, no máximo a cada 5 min (`last_reconcile_at`), só se sobrar ≥15 s:
  - Próximo reel: campanhas `next_reel` sem post → `listPosts`, reels com data > `next_reel_since`, pega o **mais antigo**, grava `post_id/post_url/post_label`.
  - Reconciliação: campanhas ativas; mídia = `post_id` ou (modo `any`) 10 posts mais recentes; `listComments`; últimas 72 h; ignora próprios, já respondidos pela conta, já com log tratado; até 30 por campanha; enfileira `comment` com `source='polling'` (sem dedupe_key).
  - 1×/dia: `followerHistory` → upsert `ig_follower_history`; `accountInfo` → `ig_zernio.followers_count`. Limpa `ig_webhook_events` > 30 dias e `ig_jobs` done/failed/dead > 14 dias.
  - Grava `last_worker_at`.
- `instagram-admin` (reescrita, JWT do usuário obrigatório, como hoje). Ações (`POST {action, ...}`):
  - `status` → `{key_set:boolean, profile_id, account:{username, ig_user_id, followers_count}|null, webhook_ok:boolean, last_worker_at}`
  - `profiles` → `{profiles:[{id,name}]}`
  - `set_profile {profile_id}` → valida, gera `webhook_secret` se não houver, `ensureWebhook(<SUPABASE_URL>/functions/v1/zernio-webhook)`, grava
  - `accounts` → contas Instagram do perfil `[{id, username, ig_user_id, picture}]`
  - `connect {redirect_url}` → `{auth_url}` (redirect_url precisa ser da mesma origem do CRM: aceita só se começar com a origem enviada no header `Origin`)
  - `select_account {account_id}` → grava `account_id/ig_user_id/username`
  - `posts` → `[{id, caption, permalink, is_reel, thumbnail, created_at}]`
  - `conversations` → `[{id, participant_id, username, updated_at, last_message}]`
  - `messages {conversation_id}` → `[{id, text, from_me, created_at}]` (ordem antiga→nova)
  - `reply {conversation_id, text}` (1–1000) → `sendDm`; erro de janela → 409 "Fora da janela de 24 h"
  - `disconnect` → limpa `account_id/ig_user_id/username` (não apaga nada no Zernio)
- `ig-r` (reescrita, pública): `?s=<slug>&r=<hash>`; slug base62 8–64; grava clique (não conta robôs/HEAD; `r` só se casar `^[A-Za-z0-9_-]{22}$`) e 302 para a URL (só http/https); senão 404 "Link não encontrado".
- `ig-report` (reescrita, pública): `?slug=` → `ig_campaign_report`; null → 404.
- Removidas do repositório: `instagram-webhook`, `instagram-worker`, `instagram-token-refresh`, `instagram-oauth` (o deploy antigo fica parado; o usuário pode apagá-las no painel). `supabase/config.toml`: tirar as entradas delas, adicionar `zernio-webhook` e `ig-campaign-worker` com `verify_jwt=false`.

## 5. Telas (rota `/instagram-automacoes`, menu atual)

Topo: **Conexão** (card): sem chave → aviso "Configure o segredo ZERNIO_API_KEY no Supabase"; com chave → escolher perfil do Zernio, escolher conta do Instagram (ou "Conectar nova conta" → abre `auth_url`; ao voltar com `?connected=instagram` recarrega), mostra @usuário, seguidores, webhook ok, "worker visto há X min", botão Desconectar. Gráfico de seguidores (90 dias, `ig_follower_history`, recharts; < 2 pontos → dica).

Abas: **Campanhas**, **Conversas**, **Registros**.

- **Campanhas**: tabela (nome, post/"qualquer post"/"próximo reel", palavras, enviadas, falhas, cliques, ativa switch, ações: editar, duplicar, compartilhar relatório → copia `/r/instagram/<slug>`, excluir). Botão "Nova campanha" → escolher modelo (Em branco + 4 modelos em PT: Link do produto, Lista de espera/lead, Aula/webinar, Cupom de desconto) → editor.
- **Editor de campanha** (rota `/instagram-automacoes/:id`, `new` para criar): formulário em seções, com prévia do DM ao lado (balões estilo Instagram):
  1. Nome, ativa
  2. Post: seletor dos 25 posts (miniaturas) | Qualquer post | Próximo reel
  3. Palavras-chave (chips, até 10) + "Inteira/Parcial" + "Qualquer comentário"; switch "Também responder DM e resposta de story"
  4. Resposta pública (switch + até 10 variações)
  5. DM de abertura (switch + texto + rótulo do botão)
  6. Pedir para seguir (switch + texto + botão; dica "A Meta só informa se a pessoa segue depois que ela toca no botão")
  7. Mensagem final (texto com `{username}`/`{link}`, contador 640/1000) + até 2 links (rótulo + URL)
  8. Follow-up (switch + texto + atraso em minutos)
  Salvar valida os limites da seção 1 e mostra erros em português. Botão Voltar com aviso de alterações não salvas.
- **Conversas**: porta do `InboxSection` atual usando as novas ações (`conversations/messages/reply`); datas com o `parseIg` atual.
- **Registros**: últimos 200 `ig_dm_logs` (data, campanha, @pessoa, gatilho, palavra, status em badge, resposta pública, erro), filtro por campanha e status.
- **Página pública** `/r/instagram/:slug` (já fora do layout autenticado): adaptar ao novo JSON (totais, gráfico 30 dias, cliques por link com rótulo/host e únicos). Sem dados de contato.

Remover: `InstagramFluxoEditor.tsx`, `components/instagram/flow/**`, `FlowsTable.tsx`, `RepliesSection.tsx`, `AccountStatus.tsx` (substituído pelo card de conexão), `lib/instagramFlow.ts` e qualquer import deles; dependência `@xyflow/react` pode sair do `package.json` se nada mais usar (conferir). `ContactsSection` fica se ainda fizer sentido (lê `ig_contacts`).

## 6. Deploy (o usuário roda, dentro de `lovable-hub-1`)

1. `npx supabase secrets set ZERNIO_API_KEY=<chave>`
2. `npx supabase db push --linked --yes`
3. `npx supabase functions deploy zernio-webhook ig-campaign-worker instagram-admin ig-r ig-report`
4. Publicar o front.
5. No CRM: escolher perfil (registra o webhook) e a conta do Instagram; criar campanha; testar comentando de outra conta.
6. Não criar automação igual dentro do painel do Zernio (mandaria DM em dobro).

## Fora do escopo
Multi-conta, workspaces, importação CSV, API/MCP, analytics de post, anúncios (comentários em anúncio), quick replies.
