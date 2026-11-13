# Instagram via Zernio: roteiro de deploy

Substitui `docs/instagram-fluxos-deploy.md` (fluxos visuais com app próprio da Meta, desativados). A conta do Instagram é conectada no Zernio, e o CRM conversa só com a API do Zernio: não precisa de app da Meta nem de App Review.

## 1. Comandos (rodar dentro de `C:\Users\R2\Desktop\Gui\CRM\lovable-hub-1`)

1. Chave do Zernio como segredo (nunca no código):
   `npx supabase secrets set ZERNIO_API_KEY=<sua chave>`
   A chave precisa ser **irrestrita, leitura e escrita, com acesso ao Inbox**.
2. Banco: `npx supabase db push --linked --yes` (aplica `20261113000001_instagram_zernio.sql`: tabelas novas, desliga os crons antigos e liga o `ig-campaign-worker` a cada minuto). As tabelas antigas continuam no banco, sem uso.
3. Funções: `npx supabase functions deploy zernio-webhook ig-campaign-worker instagram-admin ig-r ig-report`
4. Front: publicar na Vercel (push no main).
5. Opcional: no painel do Supabase → Edge Functions, apagar as antigas `instagram-webhook`, `instagram-worker`, `instagram-token-refresh` e `instagram-oauth` (não são mais chamadas).

## 2. Conectar no CRM

1. Página Instagram → card **Conexão**: escolher o **perfil** do Zernio (isso registra o webhook do CRM no Zernio).
2. Escolher a **conta do Instagram** do perfil, ou "Conectar nova conta" (abre o login do Instagram pelo Zernio e volta para o CRM).
3. O card mostra "webhook ok" e "worker visto há X min". Se o worker não aparecer em 2 min, o cron não está rodando.

## 3. Primeira campanha e teste

1. **Campanhas → Nova campanha**, escolher um modelo ou "Em branco".
2. Post (um post, qualquer post ou próximo reel), palavras-chave, mensagem e links.
3. Salvar e ativar.
4. De **outra** conta do Instagram, comentar a palavra-chave no post. O DM deve chegar em segundos, e o envio aparece em **Registros**.
5. Testar também: botão "Já estou seguindo", resposta de story/DM com a palavra (com a opção ligada) e o clique no link (conta em "Cliques").

**Não crie automação igual dentro do painel do Zernio**: a pessoa receberia DM em dobro.

## 4. Como funciona

- O Zernio manda os eventos (comentário, mensagem, toque em botão, leitura) para `zernio-webhook`, que confere a assinatura e põe na fila (`ig_jobs`).
- O `ig-campaign-worker` roda a cada minuto e trabalha ~50 s. Ele também:
  - reconfere o "seguir" em 20/40 s;
  - a cada 5 min, procura comentários perdidos das últimas 72 h e liga o próximo reel;
  - 1×/dia, grava o histórico de seguidores.
- O limite é de 750 respostas privadas por hora. O excedente é reagendado em +30 min.
- Envio "não confirmado" (o Zernio não respondeu direito) **não é repetido**, para não mandar DM duplicado. Confira na caixa de entrada antes de reenviar.
- Uma DM/resposta de story só dispara campanha se tiver uma palavra-chave. "Qualquer comentário" vale só para comentários.

## 5. Pontos a conferir no primeiro teste

Ainda não validados contra a API real do Zernio:
- as mensagens enviadas pela conta aparecem do lado direito em **Conversas** (campo `direction`);
- o toque em botão chega e libera o link;
- o DM para quem já conversou (sem comentário) é entregue.

Se algo falhar, veja **Registros** (erro em português) e a tabela `ig_webhook_events` no Supabase.
