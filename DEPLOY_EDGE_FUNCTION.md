# Como Fazer Deploy da Edge Function send-push-notification

## Opção 1: Via Supabase CLI (Recomendado)

### Passo 1: Instalar Supabase CLI

Se ainda não tiver instalado:

**Windows (PowerShell):**
```powershell
irm https://github.com/supabase/cli/releases/latest/download/supabase_windows_amd64.zip -OutFile supabase.zip
Expand-Archive -Path supabase.zip -DestinationPath .
```

Ou use o instalador: https://github.com/supabase/cli/releases

**Mac:**
```bash
brew install supabase/tap/supabase
```

### Passo 2: Fazer Login no Supabase

```bash
supabase login
```

Isso abrirá o navegador para você fazer login.

### Passo 3: Linkar o Projeto

```bash
supabase link --project-ref lqrlvefeznfaauwgvubl
```

### Passo 4: Fazer Deploy da Função

```bash
supabase functions deploy send-push-notification
```

## Opção 2: Criar a Função Diretamente no Editor do Supabase

Se preferir não usar CLI, você pode criar a função diretamente no editor:

1. No Supabase Dashboard, vá em **Edge Functions**
2. Clique em **Deploy a new function** > **Via Editor**
3. Nome da função: `send-push-notification`
4. Cole o código do arquivo `supabase/functions/send-push-notification/index.ts`
5. Clique em **Deploy**

## Verificar se Funcionou

Depois do deploy, você deve ver a função `send-push-notification` listada em **Edge Functions**.

## Próximo Passo

Depois de fazer o deploy, execute a migration SQL (ver `CHECKLIST_PUSH_NOTIFICATIONS.md`) e as push notifications estarão prontas!
