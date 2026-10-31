# Instagram Fluxos Visuais: roteiro de deploy

Ordem importa. A migration `20261031000002` (trava `ig_config`) quebra o front antigo, que lia `ig_config` direto; então publique o front novo logo depois.

## 1. Banco e edge functions

1. `npx supabase db push --linked --yes` (aplica `20261031000001_instagram_flows.sql` e `20261031000002_ig_config_lockdown.sql`; o backfill converte as automações v1 em fluxos).
2. Logo em seguida, publique as edge functions (elas dependem das tabelas novas): `instagram-webhook`, `instagram-worker`, `instagram-oauth`, `instagram-admin`.
3. Publique o front novo (a partir do passo 1 até aqui o painel antigo fica sem acesso a `ig_config`; minimize essa janela).

## 2. Tipos

`npx supabase gen types typescript --linked > src/integrations/supabase/types.ts` e conferir `npx tsc --noEmit -p tsconfig.app.json` + `npm run build`.

## 3. Reconectar o Instagram (uma vez)

Em "Conectar Instagram", reconectar para o `subscribed_apps` incluir `messaging_postbacks` (sem isso os botões dos blocos não disparam).

## 4. Meta: checklist (Tarefa 0 do plano)

- [ ] App novo com caso de uso "Gerenciar mensagens e conteúdo no Instagram"; @guisalezze como Instagram Tester (convite aceito).
- [ ] Redirect URL: `https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/instagram-oauth`
- [ ] Secrets: `IG_APP_ID`, `IG_APP_SECRET` (do Instagram, não do app Meta), `IG_WEBHOOK_VERIFY_TOKEN`.
- [ ] Webhook: callback `.../functions/v1/instagram-webhook`, campos `messages`, `comments`, `messaging_postbacks`.
- [ ] Higiene: redefinir o App Secret do app `1435271025361810` e apagar `IG_ACCESS_TOKEN.txt`.

## 5. Teste ponta a ponta (Tarefa 8)

Com 2 contas tester: comentário, DM, resposta a story, menção, botão, espera, tag, condição e webhook para um endpoint de teste. Depois, revisão do app na Meta (modo Live) para quem não é tester: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments` (vídeos de uso de cada permissão).

## 6. Pontos de atenção

- **Backfill v1**: `story_reply` virou `story`; automação v1 com vários gatilhos virou uma cópia por gatilho extra (nome com sufixo ` (gatilho)`); `match_type='any'` virou palavras-chave vazias; regras v1 sem palavras-chave (que nunca disparavam) ficam **inativas**. Revise a lista após o push.
- **Deriva de índice de postback**: o payload do botão guarda o índice do botão. Reordenar ou apagar botões de um bloco depois de mensagens já enviadas faz cliques antigos caírem em outro ramo. Evite editar blocos com botões já enviados, ou crie um fluxo novo.
- **Execuções presas**: o worker marca como `failed` ("interrompido (timeout do worker)") esperas em `running` há mais de 10 min.
