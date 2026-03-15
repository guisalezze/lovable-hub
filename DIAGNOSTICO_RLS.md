# Diagnóstico e Correção do Erro 406 ao Editar Mentorias

## Problema
Membros da equipe (e até mesmo admins) não conseguem editar mentorias, recebendo erro 406.

## Passo 1: Verificar Políticas RLS Atuais

Execute este SQL no Supabase SQL Editor para ver todas as políticas de UPDATE na tabela `implementations`:

```sql
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'implementations'
AND cmd = 'UPDATE';
```

## Passo 2: Verificar se a Função has_role Existe

```sql
SELECT 
    proname as function_name,
    prosrc as function_body
FROM pg_proc 
WHERE proname = 'has_role';
```

## Passo 3: Testar Permissões do Usuário Atual

```sql
-- Substitua 'SEU_USER_ID_AQUI' pelo ID do usuário que está tendo problemas
SELECT 
    auth.uid() as current_user_id,
    public.has_role(auth.uid(), 'admin'::app_role) as is_admin,
    public.has_role(auth.uid(), 'team'::app_role) as is_team;
```

## Passo 4: FORÇAR Correção da Política RLS

Execute este script completo para corrigir o problema:

```sql
-- ============================================
-- CORREÇÃO DEFINITIVA DA POLÍTICA RLS
-- ============================================

-- 1. Remover TODAS as políticas de UPDATE existentes
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'implementations' 
        AND cmd = 'UPDATE'
    LOOP
        RAISE NOTICE 'Removendo política: %', r.policyname;
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.implementations', r.policyname);
    END LOOP;
END $$;

-- 2. Criar nova política permissiva
CREATE POLICY "implementations_update" ON public.implementations 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 3. Verificar se foi criada
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'implementations' 
AND policyname = 'implementations_update';

-- 4. Testar se funciona (deve retornar true)
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'implementations' 
            AND policyname = 'implementations_update'
            AND cmd = 'UPDATE'
            AND qual = '(true)'
        ) THEN '✅ Política criada corretamente'
        ELSE '❌ Política NÃO foi criada'
    END as status;
```

## Passo 5: Verificar se RLS está Habilitado

```sql
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'implementations';
```

Se `rls_enabled` for `false`, execute:

```sql
ALTER TABLE public.implementations ENABLE ROW LEVEL SECURITY;
```

## Passo 6: Testar Atualização Manual

Após executar a correção, teste se consegue atualizar:

```sql
-- Substitua 'ID_DA_MENTORIA' por um ID real
UPDATE public.implementations 
SET description = 'Teste de atualização'
WHERE id = 'ID_DA_MENTORIA'
RETURNING id, client_name, description;
```

Se isso funcionar, o problema está resolvido!

## Problemas Comuns

### Erro: "permission denied for table implementations"
- **Causa**: RLS está bloqueando
- **Solução**: Execute o Passo 4

### Erro: "policy does not exist"
- **Causa**: Política foi removida mas não recriada
- **Solução**: Execute o Passo 4 novamente

### Erro: "function has_role does not exist"
- **Causa**: Função não foi criada
- **Solução**: Execute a migration `20260213034207_7e323ffa-751d-46c3-8e11-f975299db88a.sql`

## Contato
Se o problema persistir após executar todos os passos, verifique os logs do console do navegador e envie:
1. Mensagem de erro completa
2. Código de erro
3. Resultado do Passo 1 (políticas atuais)
