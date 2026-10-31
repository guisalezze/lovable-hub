# Módulo "ManyChat": respostas automáticas do Instagram com fluxos visuais

Especificação do módulo de automação do Instagram como ele funciona hoje: gatilhos, construtor visual de fluxos (blocos ligados por setas), contatos com tags, esperas agendadas e webhooks. O texto descreve o comportamento e as regras e traz os trechos de código mais importantes (Node.js + Postgres/Supabase + JS puro no front). Dá para reimplementar em qualquer stack.

---

## 1. Visão geral

```
Instagram (Meta) ──webhook──▶ /webhooks/instagram ──▶ normaliza evento ──▶ salva/atualiza CONTATO
                                                            │
                                     ┌──────────────────────┴───────────────────────┐
                                     ▼                                              ▼
                         evento comum (comentário, direct,               clique em botão (postback)
                         resposta a story, menção)                       "f:<regra>:<bloco>:<botão>"
                                     │                                              │
                     acha a 1ª REGRA ativa que combina                 segue o fluxo a partir do bloco
                     (gatilho + palavra-chave + post)                  ligado àquele botão
                                     │
                     anti-repetição (cooldown) + anti-duplicado
                                     │
                    resposta pública no comentário (opcional)
                                     │
                         executa o FLUXO bloco a bloco ──▶ Mensagem / Esperar / Tag / Condição / Webhook
                                                                         │
                                                       "Esperar" grava job ─▶ worker (30 s) retoma
```

Cada **regra** = 1 gatilho + 1 fluxo. O fluxo é um grafo guardado como JSON na própria regra.

---

## 2. Gatilhos

| Gatilho | Quando dispara | Filtros |
|---|---|---|
| `comment` – Comentário | alguém comenta num post/reel | palavras-chave, post específico (ou qualquer post), resposta pública opcional |
| `dm` – Direct | alguém manda uma mensagem de texto no direct | palavras-chave |
| `story` – Resposta a story | alguém responde um story | palavras-chave. **Se não houver regra de story que combine, cai nas regras de direct** |
| `mention` – Menção no story | alguém marca a conta num story | nenhum (não tem texto) |

**Palavras-chave**
- Lista separada por vírgula (até 30). Vazia = qualquer texto.
- Modo `contains` (contém a palavra inteira) ou `exact` (texto exato).
- A comparação ignora acento, maiúscula, pontuação e emoji ("Eu QUERO!!! 😍" combina com "quero").

```js
const fold = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function matches(rule, it, kind = it.kind) {
  if (rule.trigger !== kind) return false;
  if (rule.trigger === 'mention') return true;                                   // menção não tem texto
  if (rule.trigger === 'comment' && rule.media_id && rule.media_id !== it.media) return false; // só neste post
  const words = (rule.keywords || []).map(fold).filter(Boolean);
  if (!words.length) return true;                                                 // sem palavra = qualquer texto
  const text = fold(it.text);
  return rule.match === 'exact' ? words.includes(text) : words.some(w => (' ' + text + ' ').includes(' ' + w + ' '));
}
```

**Prioridade:** as regras ativas são lidas em ordem (`position`, depois `created_at`); **a primeira que combinar responde**, só ela.

**Anti-repetição (cooldown):** a mesma pessoa não dispara a mesma regra de novo dentro de:
- 1 hora para comentário;
- 12 horas para direct, story e menção.

Quando cai no cooldown, grava no log como "Ignorado".

**Anti-duplicado:** a Meta reenvia eventos. O id do comentário/mensagem (`ref`) é **único** na tabela de log; se o insert falhar por duplicado, não responde de novo.

**Resposta pública no comentário:** texto com várias linhas; cada linha é uma opção e o sistema **sorteia uma** (para não parecer robô). Aceita `{usuario}`.

---

## 3. Blocos do fluxo

| Bloco | Ícone/cor | Campos | Saídas |
|---|---|---|---|
| **Gatilho** (`start`) | ⚡ verde `#16a34a` | (configura a regra: gatilho, palavras, post, resposta pública) | `next` – "Começa por" |
| **Mensagem** (`message`) | 💬 azul `#2563eb` | `text` (até 640), `image` (URL, opcional), `buttons` (até 3) | `next` – "Depois", **ou** uma saída por botão "continua o fluxo" (`b0`, `b1`, `b2`) |
| **Esperar** (`delay`) | ⏱ laranja `#d97706` | `amount` + `unit` (`min`, `h`, `d`) | `next` – "Depois da espera" |
| **Tag** (`tag`) | 🏷 roxo `#7c3aed` | `action` (`add`/`remove`), `tag` | `next` |
| **Condição** (`condition`) | ⑂ verde-água `#0d9488` | `tag` | `yes` – "✅ Tem a tag" / `no` – "❌ Não tem" |
| **Webhook** (`webhook`) | 🔗 cinza `#475569` | `url` | `next` |

**Botões da mensagem** (até 3, texto até 20 caracteres):
- **"Abre um link"** → botão `web_url`, não tem saída no fluxo.
- **"Continua o fluxo"** → botão `postback`. Cada botão desse tipo vira **uma saída própria** do bloco; o fluxo **para** ali e só continua quando a pessoa clica.

**Variáveis no texto:** `{nome}` = primeiro nome; `{usuario}` = @ da pessoa.

### Formato do fluxo (JSON salvo na regra)

```json
{
  "nodes": {
    "start": { "id": "start", "type": "start", "x": 0, "y": 0, "next": "m1" },
    "m1": { "id": "m1", "type": "message", "x": 380, "y": 0,
            "text": "Oi {nome}! Quer receber o link?",
            "buttons": [ { "label": "Quero!", "type": "flow", "next": "t1" },
                         { "label": "Ver site", "type": "url", "url": "https://..." } ] },
    "t1": { "id": "t1", "type": "tag", "x": 760, "y": 0, "action": "add", "tag": "quer-triade", "next": "d1" },
    "d1": { "id": "d1", "type": "delay", "x": 1140, "y": 0, "amount": 2, "unit": "h", "next": "c1" },
    "c1": { "id": "c1", "type": "condition", "x": 1520, "y": 0, "tag": "comprou", "yes": null, "no": "m2" },
    "m2": { "id": "m2", "type": "message", "x": 1900, "y": 200, "text": "Ainda dá tempo 😉", "buttons": [] },
    "w1": { "id": "w1", "type": "webhook", "x": 0, "y": 400, "url": "https://meu-n8n/webhook/..." }
  }
}
```

- `x`/`y` = posição do bloco no canvas (só visual).
- Ligação = o campo `next` / `yes` / `no` / `buttons[i].next` aponta para o id do próximo bloco. `null` = fim do fluxo.
- Id dos blocos novos: 1ª letra do tipo + timestamp em base36 (`m` + `Date.now().toString(36)`).
- Limites: máx. 80 blocos, JSON até 200 KB; na execução, máx. 40 passos seguidos (evita loop infinito).

---

## 4. Regras da Meta que moldam o módulo (importante!)

1. **Janela de 24 h:** só dá para mandar direct até 24 h depois da **última mensagem da pessoa**. Por isso o contato guarda `last_in_at`, e o editor avisa se uma espera passar de 23 h.
2. **Vindo de comentário:** a Meta deixa mandar **só 1 mensagem privada** (endereçada ao `comment_id`) até a pessoa responder ou clicar num botão. Por isso o padrão é: 1ª mensagem com um botão "continuar" → o clique abre a conversa e libera o resto do fluxo.
3. **Comentário não abre a janela** de direct (não atualiza `last_in_at`).
4. **Imagem não vai na 1ª mensagem de um comentário** (a mensagem privada de comentário só aceita texto/botões).
5. Limites de texto: mensagem 640 caracteres, botão 20 caracteres, máx. 3 botões (template `button`).
6. A conta precisa estar inscrita no app (`POST /me/subscribed_apps`) com os campos `messages,comments,messaging_postbacks,...`, senão nenhum webhook chega.
7. Os webhooks vêm assinados: `X-Hub-Signature-256 = sha256=HMAC(app_secret, corpo_cru)`. Precisa validar sobre o **corpo cru**, antes do parse do JSON.
8. O token do Instagram vale ~60 dias e precisa ser renovado (`/refresh_access_token`). Aqui ele renova sozinho quando faltam menos de 20 dias.

---

## 5. Banco de dados (Postgres)

```sql
-- Regras (1 regra = 1 gatilho + 1 fluxo)
create table ig_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger text not null check (trigger in ('comment', 'dm', 'story', 'mention')),
  keywords text[] not null default '{}',     -- vazio = qualquer texto
  match text not null default 'contains' check (match in ('contains', 'exact')),
  media_id text,                             -- só comentários deste post (null = todos)
  media_label text,                          -- legenda do post, só para exibir
  public_replies text,                       -- respostas públicas ao comentário, uma por linha (sorteia)
  dm_text text,                              -- legado: resposta simples sem fluxo
  flow jsonb,                                -- { nodes: {...} } (seção 3)
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Log do que foi respondido. "ref" único = proteção contra evento reenviado pela Meta.
create table ig_replies (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                  -- id do comentário/mensagem; cliques usam "pb:<mid>"
  rule_id uuid references ig_rules(id) on delete set null,
  kind text not null,                        -- comment, dm, story, mention, postback
  ig_user_id text,
  username text,
  text_in text,
  status text not null default 'pending',    -- pending, sent, failed, skipped
  error text,
  created_at timestamptz not null default now()
);
create index on ig_replies (created_at desc);
create index on ig_replies (ig_user_id, rule_id, created_at desc);   -- usado pelo cooldown

-- Contatos: quem já interagiu, com tags
create table ig_contacts (
  ig_user_id text primary key,
  username text,
  name text,
  tags text[] not null default '{}',
  last_in_at timestamptz,                    -- última mensagem da pessoa (janela de 24h)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ig_contacts using gin (tags);

-- Esperas agendadas: o fluxo para e continua no bloco node_id na hora marcada
create table ig_flow_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references ig_rules(id) on delete cascade,
  ig_user_id text not null,
  node_id text not null,
  resume_at timestamptz not null,
  status text not null default 'waiting',    -- waiting, running, done, failed
  error text,
  created_at timestamptz not null default now()
);
create index on ig_flow_runs (status, resume_at);
```

Tags são sempre gravadas em minúsculas e sem espaços nas pontas.

---

## 6. Recebendo o webhook

- `GET /webhooks/instagram` → verificação da Meta: se `hub.mode=subscribe` e `hub.verify_token` bate com o token configurado, devolve `hub.challenge` em texto puro.
- `POST /webhooks/instagram` → valida a assinatura, processa e responde 200 rápido (a Meta reenvia se demorar).

Normalização dos eventos em itens `{ kind, ref, from, username, text, media, payload }`:

```js
function msgKind(msg) {
  if (!msg) return 'other';
  if (msg.is_echo) return 'echo';                                              // mensagem enviada pela própria conta
  if (msg.attachments?.some(a => a.type === 'story_mention')) return 'mention';
  if (msg.reply_to?.story) return 'story';
  return msg.text ? 'dm' : 'other';
}
function itemsOf(body) {
  const out = [];
  for (const e of body?.entry || []) {
    for (const m of e.messaging || []) out.push({ kind: m.postback ? 'postback' : msgKind(m.message), ref: m.message?.mid || null, from: m.sender?.id,
      text: m.message?.text || m.postback?.title || null, payload: m.postback?.payload || null });
    for (const c of e.changes || []) { const v = c.value || {};                // comentários vêm em "changes"
      out.push({ kind: c.field === 'comments' ? 'comment' : c.field === 'messages' ? msgKind(v.message) : c.field, ref: v.id || v.message?.mid || null,
        from: v.from?.id || v.sender?.id, username: v.from?.username || null, text: v.text || v.message?.text || null, media: v.media?.id || null }); }
  }
  return out;
}
```

Para cada item (ignorando os que vêm da própria conta):
1. cria/atualiza o contato (`@`, nome; `last_in_at` se não for comentário);
2. se for `postback` → continua o fluxo do botão (seção 8);
3. senão → resposta automática (seção 7).

Directs não trazem o `@` e comentários não trazem o nome: busca o perfil em `GET /{id}?fields=username,name,profile_pic` com cache de 6 h (a URL da foto expira).

---

## 7. Disparo da regra

```js
const TRIGGERS = { comment: ['comment'], dm: ['dm'], story: ['story', 'dm'], mention: ['mention'] };
const COOLDOWN_MS = { comment: 3600e3, dm: 12 * 3600e3, story: 12 * 3600e3, mention: 12 * 3600e3 };

async function autoReply(it) {
  const rules = await activeRules();                               // cache de 60 s, limpo ao salvar uma regra
  let rule = null;
  for (const k of TRIGGERS[it.kind]) if ((rule = rules.find(r => matches(r, it, k)))) break;
  if (!rule) return;

  // cooldown: já mandou esta regra para esta pessoa há pouco?
  const since = new Date(Date.now() - COOLDOWN_MS[it.kind]).toISOString();
  const recent = await db.from('ig_replies').select('id').eq('ig_user_id', it.from).eq('rule_id', rule.id).eq('status', 'sent').gte('created_at', since).limit(1);
  const row = { ref: it.ref, rule_id: rule.id, kind: it.kind, ig_user_id: it.from, username: it.username, text_in: it.text?.slice(0, 500) };
  if (recent.data?.length) return db.from('ig_replies').insert({ ...row, status: 'skipped', error: 'já respondida há pouco' });

  // "reserva" o evento: se o ref já existe, a Meta reenviou → sai
  const { data: claimed, error: dup } = await db.from('ig_replies').insert(row).select('id').single();
  if (dup || !claimed) return;

  const errs = [];
  if (it.kind === 'comment') {
    const pub = fill(pickLine(rule.public_replies), it);          // sorteia uma linha, troca {usuario}
    if (pub) await igPost(`${it.ref}/replies`, { message: pub }).catch(e => errs.push('resposta pública: ' + e.message));
  }
  if (rule.flow?.nodes?.start?.next) errs.push(...await startFlow(rule, it));
  await db.from('ig_replies').update({ status: errs.length ? 'failed' : 'sent', error: errs.join(' | ') || null }).eq('id', claimed.id);
}
```

Chamadas à API: `POST https://graph.instagram.com/v21.0/<path>` com `Authorization: Bearer <token>`.

---

## 8. Motor do fluxo (o coração)

```js
const MAX_STEPS = 40;
const UNIT_MS = { min: 60e3, h: 3600e3, d: 86400e3 };
const fillVars = (t, c) => String(t || '').replace(/\{usuario\}/g, c.username ? '@' + c.username : '')
  .replace(/\{nome\}/g, String(c.name || '').trim().split(/\s+/)[0] || '').trim();

async function sendMessage(rule, n, ctx) {
  // 1ª mensagem vinda de comentário vai para o comment_id (mensagem privada); depois, para o id da pessoa
  const to = ctx.viaComment ? { comment_id: ctx.viaComment } : { id: ctx.c.ig_user_id };
  const text = fillVars(n.text, ctx.c).slice(0, 640);
  const buttons = (n.buttons || []).filter(b => b.label?.trim() && (b.type === 'url' ? b.url : true)).slice(0, 3);
  if (n.image && !ctx.viaComment) await igPost('me/messages', { recipient: to, message: { attachment: { type: 'image', payload: { url: n.image } } } });
  if (!text) return;
  const message = buttons.length
    ? { attachment: { type: 'template', payload: { template_type: 'button', text, buttons: buttons.map(b => b.type === 'url'
        ? { type: 'web_url', url: b.url, title: b.label.slice(0, 20) }
        : { type: 'postback', title: b.label.slice(0, 20), payload: `f:${rule.id}:${n.id}:${(n.buttons || []).indexOf(b)}` }) } } }
    : { text };
  await igPost('me/messages', { recipient: to, message });
}

// Executa a partir do bloco "id" até acabar, parar num botão ou numa espera.
// Cada bloco segue mesmo se outro falhar (menos Mensagem: se ela falha, o fluxo para).
async function run(rule, id, ctx) {
  const nodes = rule.flow?.nodes || {}, errs = [];
  for (let i = 0; id && i < MAX_STEPS; i++) {
    const n = nodes[id];
    if (!n) break;
    try {
      if (n.type === 'message') {
        await sendMessage(rule, n, ctx); ctx.viaComment = null;
        if ((n.buttons || []).some(b => b.type !== 'url' && b.label?.trim())) return errs;   // espera o clique
        id = n.next;
      } else if (n.type === 'delay') {
        if (n.next) await db.from('ig_flow_runs').insert({ rule_id: rule.id, ig_user_id: ctx.c.ig_user_id, node_id: n.next,
          resume_at: new Date(Date.now() + Math.max(1, Number(n.amount) || 1) * (UNIT_MS[n.unit] || UNIT_MS.min)).toISOString() });
        return errs;                                                                          // o worker retoma depois
      } else if (n.type === 'tag') { await setTag(ctx.c, n.tag, n.action !== 'remove'); id = n.next; }
      else if (n.type === 'webhook') { await fireWebhook(n, rule, ctx); id = n.next; }
      else if (n.type === 'condition') id = (ctx.c.tags || []).includes(String(n.tag || '').trim().toLowerCase()) ? n.yes : n.no;
      else break;
    } catch (e) {
      errs.push(`${n.type}: ${e.message}`);
      if (n.type === 'message') return errs;
      id = n.next;
    }
  }
  return errs;
}

async function startFlow(rule, it) {
  const c = await contactOf(it.from);
  return run(rule, rule.flow?.nodes?.start?.next, { c, viaComment: it.kind === 'comment' ? it.ref : null, text: it.text, kind: it.kind });
}
```

**Clique em botão (postback):** o payload é `f:<regraId>:<blocoId>:<índiceDoBotão>`.

```js
async function onPostback(it) {
  const [, ruleId, nodeId, idx] = String(it.payload || '').split(':');
  const rule = await getRule(ruleId);
  const btn = rule?.active ? rule.flow?.nodes?.[nodeId]?.buttons?.[Number(idx)] : null;
  if (!btn?.next) return;
  // anti-duplicado do clique: ref = "pb:<mid>"
  const claimed = await insertReplyOrSkip({ ref: `pb:${it.ref}`, rule_id: rule.id, kind: 'postback', ig_user_id: it.from, text_in: btn.label });
  if (!claimed) return;
  const errs = await run(rule, btn.next, { c: await contactOf(it.from), text: btn.label, kind: 'postback' });
  await markReply(claimed.id, errs);
}
```

**Worker das esperas:** a cada 30 s pega até 20 jobs `waiting` com `resume_at <= agora`, marca `running` de forma atômica (`update ... where status='waiting'` — se não atualizou, outro processo pegou), roda `run(rule, job.node_id, ...)` e marca `done`/`failed`. Se a regra foi pausada ou apagada, marca `failed`.

**Webhook:** `POST` JSON com timeout de 10 s; resposta não-2xx = erro.

```json
{
  "evento": "instagram.fluxo",
  "regra": { "id": "uuid", "nome": "Nome do fluxo" },
  "gatilho": "comment | dm | story | mention | postback | espera",
  "mensagem": "texto que a pessoa mandou",
  "contato": { "ig_user_id": "123", "usuario": "fulana", "nome": "Fulana de Tal", "tags": ["quer-triade"] },
  "data": "2026-10-26T12:00:00.000Z"
}
```

O botão "Enviar teste" do bloco manda o mesmo formato com `"teste": true` e um contato de exemplo.

---

## 9. API do painel (admin)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/admin/instagram` | status da conta (conectada, @, seguidores, validade do token) + regras + últimas 50 respostas (com foto/@ de quem interagiu) |
| GET | `/api/admin/instagram/posts` | últimos 30 posts (id, legenda, miniatura) para escolher "só neste post" |
| GET | `/api/admin/instagram/rules/:id` | uma regra com o fluxo |
| POST | `/api/admin/instagram/rules` | cria regra |
| PATCH | `/api/admin/instagram/rules/:id` | edita regra (se mandar só `{active}`, só pausa/ativa) |
| DELETE | `/api/admin/instagram/rules/:id` | apaga regra |
| GET | `/api/admin/instagram/contacts?q=&tag=` | contatos (100 mais recentes, busca por @, filtro por tag) + contagem de cada tag |
| PATCH | `/api/admin/instagram/contacts/:id` | troca as tags de um contato |
| POST | `/api/admin/instagram/webhook-test` | dispara o teste do bloco Webhook |

Validação ao salvar regra: nome obrigatório (até 80); gatilho de menção zera palavras-chave; post e resposta pública só valem para comentário; precisa ter o gatilho ligado a algum bloco (ou pelo menos uma resposta pública); até 80 blocos.

---

## 10. Telas

### 10.1 Tela "Instagram" (lista)

1. **Status da conta:** bolinha verde/vermelha, @, nº de seguidores, "acesso renovado automaticamente (vale até dd/mm/aaaa)".
2. **Automações (fluxos)** + botão **"+ Novo fluxo"**. Texto de ajuda explicando gatilho → blocos, "a primeira regra ativa que combinar responde" e o cooldown.
   Tabela: **Fluxo** (nome, etiqueta "pausado") · **Quando** (gatilho; para comentário: "só no post: …" ou "em qualquer post") · **Palavras-chave** (etiquetas; "texto exato"; "qualquer texto") · **Blocos** ("N bloco(s)") · ações **Editar fluxo / Pausar-Ativar / Excluir** (excluir pede 2º clique: "Confirmar exclusão").
3. **Contatos:** busca por @, filtro por tag (mostra a contagem de cada tag), total. Tabela: foto + @ (link para o perfil) + nome · tags · última mensagem · botão **Tags** (modal para editar, separadas por vírgula).
4. **Últimas respostas:** quando · pessoa (foto, @, nome · tipo do evento) · o que escreveu · fluxo · status (**Respondido** verde / **Falhou** vermelho / **Ignorado** / **Enviando**) com o erro embaixo.

### 10.2 Construtor visual do fluxo (estilo ManyChat)

**Barra do topo:** "← Instagram" · nome do fluxo editável inline · "● não salvo" (laranja, quando há mudança) · checkbox **Ativo** · botão **Salvar** (também `Ctrl/Cmd + S`). Avisa antes de sair da página com mudança não salva.

**Canvas:**
- Fundo cinza claro com grade de pontinhos (radial-gradient a cada 22 px, acompanha zoom e pan).
- Arrastar o fundo = mover a visão. Rolagem = mover. `Ctrl/Cmd + rolagem` = zoom no ponto do mouse (25% a 200%).
- Ligações = curvas Bézier em SVG (cinza `#94a3b8`, 2,2 px), da bolinha de saída até a bolinha de entrada.

**Bloco (card):**
- 290 px de largura, branco, cantos 16 px, sombra suave. Selecionado = borda azul + halo. Com aviso = borda laranja.
- Cabeçalho (é por ele que se arrasta o bloco): ícone colorido quadrado + tipo em caixa alta pequena ("MENSAGEM") + resumo (texto, "2 hora(s)", "+ quer-triade", `tem "comprou"?`, URL encurtada).
- Corpo: Gatilho mostra chips (tipo/post, 🔑 palavras, 💬 responde no comentário); Mensagem mostra um balão com o texto (até 6 linhas), "🖼 imagem" e os botões de link.
- **Bolinha de entrada** à esquerda (todos menos o Gatilho).
- **Linhas de saída** no rodapé, uma por saída, com rótulo à direita e a **bolinha de saída** na borda direita (preenchida de azul quando ligada): "Começa por", "Depois", "Depois da espera", "✅ Tem a tag" / "❌ Não tem", ou "🔘 <texto do botão>" para cada botão que continua o fluxo.

**Ligar blocos:**
- Puxar a bolinha de saída e soltar em cima de outro bloco = liga (linha tracejada azul enquanto arrasta).
- Soltar **no vazio** = abre um menu "Novo bloco" ali mesmo; escolhendo o tipo, cria o bloco naquele ponto já ligado.
- No painel lateral também dá para escolher o próximo passo num select ("— fim do fluxo —", qualquer bloco existente, ou "Criar bloco novo").

**Botões flutuantes:**
- Canto superior esquerdo: **＋ Mensagem / ＋ Esperar / ＋ Tag / ＋ Condição / ＋ Webhook** (cria à direita do bloco selecionado e liga na 1ª saída livre dele) e **⇶ Organizar** (auto-layout: cada bloco numa coluna pela distância do gatilho — busca em largura —, 360 px entre colunas, 260 px entre linhas; blocos soltos vão para a última coluna; depois enquadra).
- Canto inferior esquerdo: **− / 100% / +** (clicar no % enquadra tudo) e a dica "puxe a bolinha da direita até outro bloco para ligar · arraste o título para mover".

**Painel lateral direito** (400 px; no celular vira gaveta embaixo com 55% da altura), do bloco selecionado:
- Cabeçalho com ícone + tipo + lixeira (excluir bloco, que também desliga quem apontava para ele) + ✕ (fechar). `Esc` fecha e volta ao Gatilho.
- Caixa amarela de aviso, quando houver.
- **Gatilho:** "Quando alguém" (select dos 4 gatilhos) · palavras-chave · "Combinar" (contém / texto exato) · para comentário: select do post + botão "Escolher um post" (grade de miniaturas dos últimos posts) + "Resposta pública no comentário (uma por linha, sorteia)" + aviso da regra de 1 mensagem.
- **Mensagem:** texto (contador até 640) · dica das variáveis `{nome}` `{usuario}` · imagem (URL) · seção "Botões (até 3)": para cada botão, texto (máx. 20), tipo ("Continua o fluxo" / "Abre um link"), URL se for link, ✕ para remover; "＋ Botão".
- **Esperar:** número + unidade (minuto(s)/hora(s)/dia(s)) e a dica da janela de 24 h.
- **Tag:** ação (adicionar/remover) + nome da tag (autocompleta com as tags que já existem).
- **Condição:** "A pessoa tem a tag…" (autocompleta).
- **Webhook:** URL + botão "Enviar teste".
- Seção final "Próximo passo": um select por saída do bloco.

**Avisos (validação ao vivo, deixam a borda laranja):**
- Gatilho sem ligação (e sem resposta pública) → "Ligue o gatilho a um bloco".
- Bloco que não é alcançável a partir do gatilho → "Bloco solto: não está ligado ao fluxo".
- Mensagem sem texto nem imagem → "Mensagem sem texto".
- Botão de link sem `http(s)://` → "Botão de link sem endereço".
- Espera > 23 h → "Mais de 23h: a Meta só deixa mandar direct até 24h depois da última mensagem da pessoa".
- Tag/Condição sem tag → "Escolha a tag".
- Webhook sem URL válida → "Informe a URL do webhook".

**Implementação (front, JS puro):** cada bloco é uma `div` posicionada em absoluto dentro de um "mundo" com `transform: translate(x,y) scale(z)`; as ligações são `path` num `svg` dentro desse mesmo mundo, recalculadas a partir da posição das bolinhas (`getBoundingClientRect` ÷ zoom). Eventos `pointerdown/move/up` no canvas decidem se é arrastar o fundo, um bloco ou uma ligação.

Trechos-chave:

```js
const IGN = { start: { ico: '⚡', cor: '#16a34a', label: 'Gatilho' }, message: { ico: '💬', cor: '#2563eb', label: 'Mensagem' },
  delay: { ico: '⏱', cor: '#d97706', label: 'Esperar' }, tag: { ico: '🏷', cor: '#7c3aed', label: 'Tag' },
  condition: { ico: '⑂', cor: '#0d9488', label: 'Condição' }, webhook: { ico: '🔗', cor: '#475569', label: 'Webhook' } };
const IG_NEW = { message: () => ({ text: '', buttons: [] }), delay: () => ({ amount: 1, unit: 'h' }), tag: () => ({ action: 'add', tag: '' }),
  condition: () => ({ tag: '' }), webhook: () => ({ url: '' }) };

// Saídas de cada bloco: [chave, rótulo]. A chave diz onde fica o próximo bloco: next, yes, no ou b0..b2 (botão).
const flowBtn = b => b.type !== 'url' && b.label?.trim();
const outs = n => n.type === 'condition' ? [['yes', '✅ Tem a tag'], ['no', '❌ Não tem']]
  : n.type === 'message' && (n.buttons || []).some(flowBtn) ? n.buttons.map((b, i) => flowBtn(b) ? [`b${i}`, `🔘 ${b.label}`] : null).filter(Boolean)
  : [['next', n.type === 'start' ? 'Começa por' : n.type === 'delay' ? 'Depois da espera' : 'Depois']];
const getOut = (n, k) => /^b\d$/.test(k) ? n.buttons[+k[1]]?.next : n[k];
const setOut = (n, k, v) => { if (/^b\d$/.test(k)) n.buttons[+k[1]].next = v; else n[k] = v; };

// Curva da ligação
const curve = (a, b) => { const dx = Math.max(50, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };

// Blocos alcançáveis a partir do gatilho (para o aviso "bloco solto")
const reachable = nodes => { const seen = new Set(), q = ['start'];
  while (q.length) { const k = q.shift(); if (seen.has(k) || !nodes[k]) continue; seen.add(k);
    outs(nodes[k]).forEach(([o]) => getOut(nodes[k], o) && q.push(getOut(nodes[k], o))); }
  return seen; };

// Zoom mantendo o ponto do mouse fixo
const zoomAt = (z, cx, cy) => { z = Math.min(2, Math.max(.25, z));
  view.x = cx - (cx - view.x) * z / view.z; view.y = cy - (cy - view.y) * z / view.z; view.z = z; applyView(); };
```

---

## 11. Tarefas de fundo

- **Worker das esperas:** a cada 30 s (seção 8).
- **Renovação do token:** 1 min depois de subir, inscreve a conta nos webhooks e tenta renovar; depois, 1×/dia. Só renova de fato quando faltam < 20 dias. O token renovado fica salvo num arquivo fora da pasta do deploy.
- **Log bruto:** todo evento recebido é anexado num arquivo `.jsonl` (útil para depurar formato de payload).

## 12. Configuração necessária

- App na Meta com o produto **Instagram (API com login do Instagram)**, conta profissional conectada.
- Permissões: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`.
- Webhook do Instagram apontando para `https://SEU-DOMINIO/webhooks/instagram`, campos `messages`, `comments`, `messaging_postbacks` (e opcionalmente `messaging_seen`, `message_reactions`, `messaging_referral`, `live_comments`).
- Variáveis de ambiente: token do Instagram, ID da conta (para ignorar as próprias mensagens), app secret (para validar a assinatura) e verify token (para a verificação do webhook).
- Para mandar DM para quem não é seguidor/testador, o app precisa estar **publicado** (modo Live) com as permissões aprovadas.
