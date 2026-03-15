# Configurar Chave VAPID no Vercel

## Importante ⚠️

**No Vercel você só precisa da CHAVE PÚBLICA (Public Key).**
**NUNCA coloque a chave privada no Vercel!**

## Passo a Passo

### 1. Acesse o Vercel Dashboard
- Vá em https://vercel.com
- Faça login e selecione seu projeto

### 2. Vá em Settings > Environment Variables
- No menu do projeto, clique em **Settings**
- No menu lateral, clique em **Environment Variables**

### 3. Adicione a Chave Pública
- Clique em **Add New**
- **Name**: `VITE_VAPID_PUBLIC_KEY`
- **Value**: `BKql2QWqicmSsBRuQHzFdzgnHJ7oFV6qXt1HXJ7R2YCoMTaTA47S_BfffbO0l2JjFqf7-Ts5xx7H3kzUMmOGO38`
- **Environments**: Marque todas as opções:
  - ✅ Production
  - ✅ Preview
  - ✅ Development
- Clique em **Save**

## Pronto! ✅

Depois de adicionar a variável, faça um novo deploy no Vercel para que a mudança tenha efeito.
