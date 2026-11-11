# Instagram: recursos inspirados no OpenReply

Extensão do módulo de fluxos visuais (`docs/superpowers/specs/2026-10-31-instagram-fluxos-visuais-design.md`, que continua valendo). Referência: github.com/diwenne/openreply (`lib/queue/dm-worker.ts`, `lib/meta/client.ts`, `lib/polling/comment-reconciler.ts`, `lib/utils/rate-limiter.ts`, `docs/delivery-retries.md`).

Base técnica atual: Supabase (Postgres + Edge Functions Deno), `graph.instagram.com/v25.0` com token IGAA em `ig_config`, regras em `ig_automations` (`flow jsonb`), log `ig_replies` (`ref` único), esperas `ig_flow_runs`, contatos `ig_contacts`, motor duplicado byte-a-byte entre `instagram-webhook` e `instagram-worker` (bloco "motor do fluxo"), painel em `src/pages/InstagramAutomacoes.tsx` + `src/components/instagram/**`, helpers em `src/lib/instagramFlow.ts`, edge `instagram-admin` (JWT) para o que precisa do token.

## 1. Bloco "Seguir" (follow gate)

Novo tipo de bloco `follow` (ícone 👤, cor `#db2777`, rótulo "Seguir").
- Campos: `text` (pedido, ≤640, default "Me segue aqui e toque no botão abaixo pra eu te mandar 💛"), `button` (≤20, default "Já estou seguindo ✅").
- Saídas: `yes` "✅ Segue" e `no` "❌ Não seguiu" (opcional; `null` = reenviar o pedido).
- Consulta: `GET /{igsid}?fields=is_user_follow_business` → `true | false | null` (null = Meta não informou).

Motor, ao chegar no bloco:
1. Se o contexto veio de uma interação da pessoa (postback ou DM/story, não comentário) → consulta. `true` → segue `yes`. Senão → manda o pedido.
2. Vindo de comentário (1ª mensagem via `comment_id`) → manda o pedido direto (a Meta só informa o follow depois que a pessoa interage).
3. O pedido é um template `button` com 1 postback de payload `f:<regra>:<bloco>:follow`. O fluxo para ali.

Clique no botão do pedido (`…:follow`):
- Consulta. `true` → `yes`. `null` → `yes` (fail-open depois do toque: quem já segue nunca fica preso).
- `false` → a Meta demora a registrar follow novo (medido: ainda `false` em ~17 s, `true` em ~68 s). Agenda nova consulta em `ig_flow_runs` (`kind='follow_recheck'`, `attempt`) em 20 s e depois +40 s. Na 1ª agenda, manda "Conferindo… 👀" (texto fixo curto).
- Depois da última consulta ainda `false` → se `no` ligado, segue `no`; senão reenvia o pedido (mesmo botão).
- Anti-duplicado do clique continua `pb:<mid>`; toques repetidos durante a reconferência não criam outra reconferência (só um job `waiting` por regra+pessoa+bloco).
- Quando retomado pelo worker sem toque (espera, leitura) → fail-closed: só `true` segue `yes`.

Avisos no construtor: texto vazio → "Pedido sem texto". Dica fixa no painel: "A Meta só informa se a pessoa segue depois que ela toca no botão."

## 2. Busca de comentários perdidos (reconciliação)

A Meta não manda webhook de muitos comentários ("ver mais", contas que não seguem, filtrados). A cada execução do worker (cron 1 min), no máximo a cada 5 min (guardar `last_reconcile_at` em `ig_config`):
- Regras ativas de comentário. Com `post_id` → só esse post. Sem `post_id` → os 5 posts mais recentes.
- `GET /{media}/comments?fields=id,text,timestamp,from{id,username},replies{from{id}}&limit=50`, só comentários das últimas 72 h.
- Ignora: já existe `ig_replies.ref = comment.id`; a própria conta já respondeu (`replies.from.id = conta`); comentário da própria conta.
- O que sobra passa pelo mesmo `autoReply` do webhook (mesma prioridade, cooldown, limite de envio).
- Teto: 100 comentários processados por varredura; erro 368/4/17 (limite da Meta) encerra a varredura.
- Por isso `autoReply` (e `matches`, `fold`, `pickLine`) entra no bloco compartilhado do motor (cópia idêntica em webhook e worker).

## 3. Limite de 750 mensagens privadas por hora

Antes de mandar a 1ª mensagem de um comentário (via `comment_id`): contar `ig_replies` com `kind='comment'` e `status in ('sent','failed')` na última hora. Se ≥ 750 → não reserva o evento (não grava em `ig_replies`); grava em `ig_events` um aviso `rate_limited`. A reconciliação (item 2) pega o comentário depois. Constante `MAX_PRIVATE_REPLIES_PER_HOUR = 750`.

## 4. Links rastreados

- Tabelas: `ig_links (id, slug text unique, rule_id → ig_automations on delete cascade, node_id text, button_index int, url text, created_at)` com único em `(rule_id, node_id, button_index, url)`; `ig_link_clicks (id, link_id → ig_links on delete cascade, ig_user_id text null, created_at)`.
- Botão de link tem `track: boolean` (default `true` para botões novos; ausente = `true`).
- Motor, ao mandar botão `url` rastreado: upsert do link (slug 8 chars base62 aleatório) e usa `<SUPABASE_URL>/functions/v1/ig-r?s=<slug>&u=<igsid>`.
- Nova edge `ig-r` (pública, `verify_jwt=false`): grava o clique e responde 302 para a URL. Slug inválido → 404 simples.
- Painel: na tabela de fluxos, coluna "Cliques" (total); no editor, no botão de link, "N cliques".

## 5. Envio após leitura

- No bloco Mensagem com botões "continua o fluxo": opção "Se a pessoa ler e não tocar em N min, seguir pelo botão X" (`read_fallback: {minutes, button}`; minutes 1–60, default 5).
- Motor: ao mandar essa mensagem, grava `ig_flow_runs` `kind='read_fallback'`, `status='awaiting_read'`, `source_node`, `node_id = buttons[X].next`, `resume_at` = data distante.
- Webhook: evento `messaging[].read` (campo `messaging_seen`) da pessoa → os `awaiting_read` dela viram `waiting` com `resume_at = now + minutes`.
- Clique em qualquer botão daquela mensagem → cancela (`status='done'`, `error='clicou'`) os `awaiting_read`/`waiting` com mesmo `rule_id`+pessoa+`source_node`.
- Retomado pelo worker → fail-closed no bloco Seguir.
- `set_token` passa a assinar também `messaging_seen`.

## 6. Fallback para texto simples

Em `sendMessage`: se a Meta recusar o template com erro código 100 → reenviar como texto (`text` + "\n\n" + "<rótulo>: <url>" por botão de link; botões de fluxo são descartados e o fluxo segue por `next` se houver, senão para). Erro código 1 ou 5xx → não reenviar (a entrega pode ter acontecido; `docs/delivery-retries.md` do OpenReply). Erro registrado normalmente.

## 7. Próximo reel

- Regra de comentário com opção "No próximo reel que eu publicar": colunas `pending_next_reel boolean default false`, `next_reel_since timestamptz`.
- Worker (junto da reconciliação): para regras ativas com `pending_next_reel`, busca `GET /me/media?fields=id,caption,media_product_type,timestamp&limit=10`, pega o 1º com `media_product_type='REELS'` e `timestamp > next_reel_since`, grava `post_id`, `media_label` (legenda até 80) e `pending_next_reel=false`.
- Enquanto pendente, a regra não responde a nada.

## 8. Inbox, histórico de seguidores e relatórios

- **Inbox** (aba "Conversas" na tela Instagram): via `instagram-admin` ações `conversations` (`GET /me/conversations?platform=instagram&fields=id,updated_time,participants,messages.limit(1){message,from,created_time}&limit=25`, com recuperação simples: se erro código 1, tentar com `fields=id,updated_time` e marcar "detalhes indisponíveis"), `messages` (`GET /{conversation}?fields=messages.limit(30){message,from,created_time}`) e `reply` (POST `me/messages` texto; recusa fora da janela de 24 h desde a última mensagem da pessoa, com aviso).
- **Histórico de seguidores**: tabela `ig_follower_snapshots (day date primary key, followers int, created_at)`; o worker grava 1×/dia (`followers_count` de `/me`). Gráfico de linha (90 dias) no card de status da conta.
- **Relatórios**: `ig_automations.share_slug text unique` (gerado ao ativar "compartilhar"). Página pública `/r/instagram/:slug` (fora do layout autenticado) consome a edge `ig-report` (pública) que devolve só agregados: nome do fluxo, respostas enviadas/falhas/ignoradas por dia (30 dias), cliques por botão. Nunca dados de contatos.

## Fora do escopo
Multi-conta, workspaces, i18n, API/MCP de leitura.
