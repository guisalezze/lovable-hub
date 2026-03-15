-- ============================================
-- CORREÇÃO DEFINITIVA - ERRO 406 AO EDITAR MENTORIAS
-- Execute este script completo no Supabase SQL Editor
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

-- 2. Garantir que RLS está habilitado
ALTER TABLE public.implementations ENABLE ROW LEVEL SECURITY;

-- 3. Criar nova política permissiva (permite qualquer usuário autenticado editar)
CREATE POLICY "implementations_update" ON public.implementations 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 4. Verificar se foi criada corretamente
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'implementations' 
            AND policyname = 'implementations_update'
            AND cmd = 'UPDATE'
        ) THEN '✅ SUCESSO: Política criada corretamente!'
        ELSE '❌ ERRO: Política NÃO foi criada'
    END as resultado;

-- 5. Mostrar a política criada
SELECT 
    policyname,
    cmd,
    qual as "USING clause",
    with_check as "WITH CHECK clause"
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'implementations' 
AND policyname = 'implementations_update';
