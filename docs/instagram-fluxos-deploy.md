# Instagram Fluxos Visuais: roteiro de deploy

Ordem importa. A migration `20261031000002` (trava `ig_config`) quebra o front antigo, que lia `ig_config` direto; então publique o front novo logo depois.

## 1. Banco e edge functions

1. `npx supabase db push --linked --yes` (aplica `20261031000001_instagram_flows.sql` e `20261031000002_ig_config_lockdown.sql`; o backfill converte as automações v1 em fluxos).
2. Logo em seguida, publique as edge functions (elas dependem das tabelas novas): `instagram-webhook`, `instagram-worker`, `instagram-admin` (`instagram-oauth` não é mais usada pelo painel).
3. Publique o front novo (a partir do passo 1 até aqui o painel antigo fica sem acesso a `ig_config`; minimize essa janela).

## 2. Tipos

`npx supabase gen types typescript --linked > src/integrations/supabase/types.ts` e conferir `npx tsc --noEmit -p tsconfig.app.json` + `npm run build`.

## 3. Conectar o Instagram (colar token)

O botão de OAuth ("Conectar Instagram") não é mais usado: a Meta força apps novos para o "Login unificado", e o fluxo `instagram.com/oauth/authorize` falha com "Invalid platform app". A conexão agora é por token colado:

1. No painel do app da Meta: Instagram → Configuração da API com login unificado → adicionar/selecionar a conta → **Gerar token**. O token de usuário do Instagram começa com `IGAA`.
2. No CRM, página Instagram: **Colar token** (ou **Trocar token**), cole e Salvar.
3. A função `instagram-admin` (ação `set_token`) valida o token, tenta renová-lo para 60 dias, grava em `ig_config` (conta única), e assina o webhook (`messages`, `comments`, `messaging_postbacks`, `messaging_seen`). Se a assinatura falhar, o CRM avisa; o token fica salvo.
4. O job diário `instagram-token-refresh` mantém o token renovado.

Não são usados: a URL do Login unificado com `config_id` e tokens `EAA...` de usuário do sistema.

## 4. Meta: checklist (Tarefa 0 do plano)

- [ ] App novo com caso de uso "Gerenciar mensagens e conteúdo no Instagram"; @guisalezze como Instagram Tester (convite aceito).
- [ ] Secrets: `IG_APP_SECRET` (secret do app Instagram; usado por `instagram-webhook` para validar a assinatura HMAC `X-Hub-Signature-256` dos eventos) e `IG_WEBHOOK_VERIFY_TOKEN`. `IG_APP_ID` e `IG_APP_SECRET` também são lidos por `instagram-oauth`, que não é mais usada.
- [ ] Webhook: callback `.../functions/v1/instagram-webhook`, campos `messages`, `comments`, `messaging_postbacks`, `messaging_seen`.
- [ ] Higiene: redefinir o App Secret do app `1435271025361810` e apagar `IG_ACCESS_TOKEN.txt`.

## 5. Teste ponta a ponta (Tarefa 8)

Com 2 contas tester: comentário, DM, resposta a story, menção, botão, espera, tag, condição e webhook para um endpoint de teste. Depois, revisão do app na Meta (modo Live) para quem não é tester: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments` (vídeos de uso de cada permissão).

## 6. Pontos de atenção

- **Backfill v1**: `story_reply` virou `story`; automação v1 com vários gatilhos virou uma cópia por gatilho extra (nome com sufixo ` (gatilho)`); `match_type='any'` virou palavras-chave vazias; regras v1 sem palavras-chave (que nunca disparavam) ficam **inativas**. Revise a lista após o push.
- **Deriva de índice de postback**: o payload do botão guarda o índice do botão. Reordenar ou apagar botões de um bloco depois de mensagens já enviadas faz cliques antigos caírem em outro ramo. Evite editar blocos com botões já enviados, ou crie um fluxo novo.
- **Execuções presas**: o worker marca como `failed` ("interrompido (timeout do worker)") esperas em `running` há mais de 10 min.

## 7. Atualização "OpenReply" (Seguir, reconciliação, links, leitura, próximo reel, conversas, relatórios)

Ordem (rodar dentro de `lovable-hub-1`):

1. `npx supabase db push --linked --yes`: aplica `20261111000002_instagram_openreply.sql` e `20261111000003_ig_report_fn.sql`. **Antes** das funções: o motor novo grava `kind`/`source_node` em `ig_flow_runs` e falha no banco antigo.
2. Publicar **juntas** `instagram-webhook` e `instagram-worker` (um worker antigo não sabe retomar `follow_recheck`/`read_fallback`), depois `instagram-admin`, `ig-r` e `ig-report` (as duas últimas são públicas, `verify_jwt = false` no `config.toml`):
   `npx supabase functions deploy instagram-webhook instagram-worker instagram-admin ig-r ig-report`
3. Publicar o front (Vercel). Antes disso, o editor novo daria erro ao salvar "próximo reel" no banco antigo.
4. **Envio após leitura** precisa de duas coisas: colar o token de novo no painel (o `set_token` passa a assinar `messaging_seen`) e marcar o campo `messaging_seen` no Webhook do app da Meta. Sem isso, a opção nunca dispara (as esperas expiram em 7 dias).

Comportamentos a saber:

- **Seguir**: a Meta só informa se a pessoa segue depois que ela toca no botão; follow recém-feito demora ~1 min para aparecer, então o motor reconfere em 20 s e 40 s (na prática 1–2 min, por causa do cron de 1 min).
- **Reconciliação**: a cada 5 min o worker busca comentários das últimas 72 h que a Meta não mandou por webhook (até 100 por varredura; regra sem post = 5 posts mais recentes).
- **Limite**: no máximo 750 mensagens privadas de comentário por hora; o excedente fica para a reconciliação.
- **Links rastreados**: botões de link passam por `.../functions/v1/ig-r`; cliques aparecem na lista de fluxos e no editor.
- **Conversas**: só responde dentro de 24 h desde a última mensagem da pessoa. Toques em botões podem não contar como mensagem para essa checagem.
- **Relatório público**: "Compartilhar relatório" na lista gera `/r/instagram/<código>`; mostra só totais por dia e cliques por botão, nada de contatos.
