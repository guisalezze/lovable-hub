# Como Gerar Chaves VAPID para Push Notifications

## Passo 1: Abrir o Terminal

**No Windows:**
- Pressione `Win + R`
- Digite `cmd` ou `powershell` e pressione Enter
- OU abra o PowerShell diretamente

**No Mac/Linux:**
- Abra o Terminal

## Passo 2: Navegar até a Pasta do Projeto

No terminal, digite:

```bash
cd "C:\Users\R2\Desktop\Gui\CRM\lovable-hub-1"
```

(Pressione Enter)

## Passo 3: Gerar as Chaves VAPID

Digite o comando:

```bash
npx web-push generate-vapid-keys
```

(Pressione Enter e aguarde alguns segundos)

## Passo 4: Copiar as Chaves

Você verá algo assim:

```
=======================================

Public Key:
BEl62iUYgUivxIkv69yViEuiBIa40HI...

Private Key:
8KYkd... (mantenha secreto!)

=======================================
```

## Passo 5: Configurar as Chaves

### 5.1. No Projeto (arquivo `.env`)

1. Na pasta do projeto, crie ou edite o arquivo `.env`
2. Adicione a linha:

```env
VITE_VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa40HI...
```

(Substitua pela sua chave pública real)

### 5.2. No Vercel (Variáveis de Ambiente)

1. Acesse https://vercel.com
2. Vá no seu projeto
3. Clique em **Settings** > **Environment Variables**
4. Adicione:
   - **Name**: `VITE_VAPID_PUBLIC_KEY`
   - **Value**: sua chave pública
   - **Environments**: Production, Preview, Development (marque todos)
5. Clique em **Save**

### 5.3. No Supabase (Edge Functions Secrets)

1. Acesse https://supabase.com
2. Vá no seu projeto
3. Clique em **Settings** > **Edge Functions** > **Secrets**
4. Adicione dois secrets:

   **Secret 1:**
   - **Name**: `VITE_VAPID_PUBLIC_KEY`
   - **Value**: sua chave pública
   
   **Secret 2:**
   - **Name**: `VAPID_PRIVATE_KEY`
   - **Value**: sua chave privada (mantenha secreta!)

5. Clique em **Save** para cada um

## Pronto! 🎉

Depois de configurar tudo, faça um novo deploy no Vercel e as push notifications funcionarão!
